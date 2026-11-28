// TOML parsing and serialization for node:formats/toml, backed by toml++.

#include "env-inl.h"
#include "node_binding.h"
#include "node_errors.h"
#include "node_external_reference.h"
#include "util-inl.h"
#include "v8.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <sstream>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "toml++/toml.hpp"

namespace node {
namespace toml {

using v8::Array;
using v8::BigInt;
using v8::Boolean;
using v8::Context;
using v8::EscapableHandleScope;
using v8::Function;
using v8::FunctionCallbackInfo;
using v8::HandleScope;
using v8::Isolate;
using v8::Just;
using v8::KeyCollectionMode;
using v8::KeyConversionMode;
using v8::Local;
using v8::LocalVector;
using v8::Maybe;
using v8::MaybeLocal;
using v8::NewStringType;
using v8::Nothing;
using v8::Number;
using v8::Object;
using v8::PropertyFilter;
using v8::String;
using v8::Undefined;
using v8::Value;

namespace {

// Must match the constants in lib/internal/formats/toml.js.
enum class DatetimeKind : int {
  kOffsetDateTime = 0,
  kLocalDateTime = 1,
  kLocalDate = 2,
  kLocalTime = 3,
};

constexpr size_t kMaxSerializeDepth = 128;
constexpr double kMaxSafeInteger = 9007199254740991.0;

void AppendDate(std::string* out, const ::toml::date& date) {
  char buf[16];
  snprintf(buf,
           sizeof(buf),
           "%04u-%02u-%02u",
           static_cast<unsigned>(date.year),
           static_cast<unsigned>(date.month),
           static_cast<unsigned>(date.day));
  out->append(buf);
}

void AppendTime(std::string* out, const ::toml::time& time) {
  char buf[32];
  snprintf(buf,
           sizeof(buf),
           "%02u:%02u:%02u",
           static_cast<unsigned>(time.hour),
           static_cast<unsigned>(time.minute),
           static_cast<unsigned>(time.second));
  out->append(buf);
  if (time.nanosecond != 0) {
    snprintf(buf, sizeof(buf), ".%09u", static_cast<unsigned>(time.nanosecond));
    std::string_view fraction(buf);
    while (fraction.back() == '0') fraction.remove_suffix(1);
    out->append(fraction);
  }
}

void AppendOffset(std::string* out, const ::toml::time_offset& offset) {
  if (offset.minutes == 0) {
    out->push_back('Z');
    return;
  }
  const int minutes = offset.minutes < 0 ? -offset.minutes : offset.minutes;
  char buf[8];
  snprintf(buf,
           sizeof(buf),
           "%c%02d:%02d",
           offset.minutes < 0 ? '-' : '+',
           minutes / 60,
           minutes % 60);
  out->append(buf);
}

// Converts a parsed toml++ tree into JavaScript values.
class Converter {
 public:
  Converter(Isolate* isolate,
            Local<Context> context,
            Local<Function> create_datetime,
            bool bigint)
      : isolate_(isolate),
        context_(context),
        create_datetime_(create_datetime),
        bigint_(bigint) {}

  MaybeLocal<Value> Convert(const ::toml::node& node) {
    switch (node.type()) {
      case ::toml::node_type::table:
        return ConvertTable(*node.as_table());
      case ::toml::node_type::array:
        return ConvertArray(*node.as_array());
      case ::toml::node_type::string: {
        const std::string& value = node.as_string()->get();
        return String::NewFromUtf8(
            isolate_, value.data(), NewStringType::kNormal, value.size());
      }
      case ::toml::node_type::integer: {
        const int64_t value = node.as_integer()->get();
        if (bigint_ || value > kMaxSafeInteger || value < -kMaxSafeInteger) {
          return BigInt::New(isolate_, value);
        }
        return Number::New(isolate_, static_cast<double>(value));
      }
      case ::toml::node_type::floating_point:
        return Number::New(isolate_, node.as_floating_point()->get());
      case ::toml::node_type::boolean:
        return Boolean::New(isolate_, node.as_boolean()->get());
      case ::toml::node_type::date: {
        std::string text;
        AppendDate(&text, node.as_date()->get());
        return CreateDatetime(DatetimeKind::kLocalDate, text);
      }
      case ::toml::node_type::time: {
        std::string text;
        AppendTime(&text, node.as_time()->get());
        return CreateDatetime(DatetimeKind::kLocalTime, text);
      }
      case ::toml::node_type::date_time: {
        const ::toml::date_time& value = node.as_date_time()->get();
        std::string text;
        AppendDate(&text, value.date);
        text.push_back('T');
        AppendTime(&text, value.time);
        if (value.offset) AppendOffset(&text, *value.offset);
        return CreateDatetime(value.offset ? DatetimeKind::kOffsetDateTime
                                           : DatetimeKind::kLocalDateTime,
                              text);
      }
      case ::toml::node_type::none:
        break;
    }
    UNREACHABLE();
  }

 private:
  MaybeLocal<Value> ConvertTable(const ::toml::table& table) {
    EscapableHandleScope scope(isolate_);
    // toml++ keeps keys sorted. Restore document order from source positions.
    std::vector<std::pair<const ::toml::key*, const ::toml::node*>> entries;
    entries.reserve(table.size());
    for (const auto& [key, value] : table) entries.emplace_back(&key, &value);
    std::stable_sort(entries.begin(), entries.end(), [](auto& a, auto& b) {
      const ::toml::source_position& lhs = a.first->source().begin;
      const ::toml::source_position& rhs = b.first->source().begin;
      return lhs.line != rhs.line ? lhs.line < rhs.line
                                  : lhs.column < rhs.column;
    });

    Local<Object> object = Object::New(isolate_);
    for (const auto& [key, node] : entries) {
      Local<String> name;
      Local<Value> value;
      if (!String::NewFromUtf8(isolate_,
                               key->data(),
                               NewStringType::kNormal,
                               static_cast<int>(key->length()))
               .ToLocal(&name) ||
          !Convert(*node).ToLocal(&value) ||
          object->CreateDataProperty(context_, name, value).IsNothing()) {
        return {};
      }
    }
    return scope.Escape(object);
  }

  MaybeLocal<Value> ConvertArray(const ::toml::array& array) {
    EscapableHandleScope scope(isolate_);
    LocalVector<Value> elements(isolate_);
    elements.reserve(array.size());
    for (const ::toml::node& node : array) {
      Local<Value> value;
      if (!Convert(node).ToLocal(&value)) return {};
      elements.push_back(value);
    }
    return scope.Escape(
        Array::New(isolate_, elements.data(), elements.size()));
  }

  MaybeLocal<Value> CreateDatetime(DatetimeKind kind, const std::string& text) {
    Local<Value> argv[] = {
        Number::New(isolate_, static_cast<int>(kind)),
        OneByteString(isolate_, text.data(), text.size()),
    };
    return create_datetime_->Call(
        context_, Undefined(isolate_), arraysize(argv), argv);
  }

  Isolate* isolate_;
  Local<Context> context_;
  Local<Function> create_datetime_;
  bool bigint_;
};

// Builds a toml++ tree from JavaScript values.
class Builder {
 public:
  Builder(Isolate* isolate,
          Local<Context> context,
          Local<Function> format_datetime)
      : isolate_(isolate),
        context_(context),
        format_datetime_(format_datetime),
        object_prototype_(Object::New(isolate)->GetPrototype()),
        ancestors_(isolate) {}

  Maybe<bool> BuildDocument(Local<Value> value, ::toml::table* out) {
    if (!IsTable(value)) {
      THROW_ERR_INVALID_ARG_TYPE(isolate_,
                                 "The TOML document must be a plain object");
      return Nothing<bool>();
    }
    return BuildTable(value.As<Object>(), out);
  }

 private:
  // Plain objects (and null-prototype objects) are serialized as tables.
  bool IsTable(Local<Value> value) {
    if (!value->IsObject() || value->IsArray() || value->IsFunction() ||
        value->IsProxy()) {
      return false;
    }
    Local<Value> prototype = value.As<Object>()->GetPrototype();
    return prototype->IsNull() || prototype == object_prototype_;
  }

  Maybe<bool> Enter(Local<Object> object) {
    if (ancestors_.size() >= kMaxSerializeDepth) {
      THROW_ERR_INVALID_ARG_VALUE(isolate_, "Maximum nesting depth exceeded");
      return Nothing<bool>();
    }
    for (const Local<Object>& ancestor : ancestors_) {
      if (ancestor == object) {
        THROW_ERR_INVALID_ARG_VALUE(isolate_,
                                    "Cannot serialize circular structures");
        return Nothing<bool>();
      }
    }
    ancestors_.push_back(object);
    return Just(true);
  }

  void Leave() { ancestors_.pop_back(); }

  Maybe<bool> BuildTable(Local<Object> object, ::toml::table* out) {
    HandleScope scope(isolate_);
    if (Enter(object).IsNothing()) return Nothing<bool>();
    Local<Array> names;
    if (!object
             ->GetPropertyNames(context_,
                                KeyCollectionMode::kOwnOnly,
                                static_cast<PropertyFilter>(
                                    PropertyFilter::ONLY_ENUMERABLE |
                                    PropertyFilter::SKIP_SYMBOLS),
                                v8::IndexFilter::kIncludeIndices,
                                KeyConversionMode::kConvertToString)
             .ToLocal(&names)) {
      return Nothing<bool>();
    }
    for (uint32_t i = 0; i < names->Length(); i++) {
      Local<Value> name;
      Local<Value> value;
      if (!names->Get(context_, i).ToLocal(&name) ||
          !object->Get(context_, name).ToLocal(&value)) {
        return Nothing<bool>();
      }
      if (value->IsUndefined()) continue;
      std::unique_ptr<::toml::node> node = BuildValue(value);
      if (!node) return Nothing<bool>();
      Utf8Value key(isolate_, name);
      out->insert_or_assign(std::string_view(key.out(), key.length()),
                            std::move(*node));
    }
    Leave();
    return Just(true);
  }

  Maybe<bool> BuildArray(Local<Array> array, ::toml::array* out) {
    HandleScope scope(isolate_);
    if (Enter(array).IsNothing()) return Nothing<bool>();
    for (uint32_t i = 0; i < array->Length(); i++) {
      Local<Value> item;
      if (!array->Get(context_, i).ToLocal(&item)) return Nothing<bool>();
      std::unique_ptr<::toml::node> node = BuildValue(item);
      if (!node) return Nothing<bool>();
      out->push_back(std::move(*node));
    }
    Leave();
    return Just(true);
  }

  // Returns nullptr when a JavaScript exception is pending.
  std::unique_ptr<::toml::node> BuildValue(Local<Value> value) {
    if (value->IsString()) {
      Utf8Value string(isolate_, value);
      return std::make_unique<::toml::value<std::string>>(
          std::string(string.out(), string.length()));
    }
    if (value->IsBoolean()) {
      return std::make_unique<::toml::value<bool>>(value->IsTrue());
    }
    if (value->IsNumber()) {
      const double number = value.As<Number>()->Value();
      if (std::trunc(number) == number && std::abs(number) <= kMaxSafeInteger &&
          !(number == 0 && std::signbit(number))) {
        return std::make_unique<::toml::value<int64_t>>(
            static_cast<int64_t>(number));
      }
      return std::make_unique<::toml::value<double>>(number);
    }
    if (value->IsBigInt()) {
      bool lossless;
      const int64_t integer = value.As<BigInt>()->Int64Value(&lossless);
      if (!lossless) {
        THROW_ERR_OUT_OF_RANGE(
            isolate_, "TOML integers must fit in 64-bit signed integers");
        return nullptr;
      }
      return std::make_unique<::toml::value<int64_t>>(integer);
    }
    if (value->IsArray()) {
      auto array = std::make_unique<::toml::array>();
      if (BuildArray(value.As<Array>(), array.get()).IsNothing()) {
        return nullptr;
      }
      return array;
    }
    if (IsTable(value)) {
      auto table = std::make_unique<::toml::table>();
      if (BuildTable(value.As<Object>(), table.get()).IsNothing()) {
        return nullptr;
      }
      return table;
    }
    if (value->IsObject() && !value->IsFunction()) {
      Local<Value> formatted;
      Local<Value> argv[] = {value};
      if (!format_datetime_->Call(context_, Undefined(isolate_), 1, argv)
               .ToLocal(&formatted)) {
        return nullptr;
      }
      if (formatted->IsString()) return ParseDatetime(formatted);
    }
    THROW_ERR_INVALID_ARG_TYPE(isolate_,
                               value->IsNull()
                                   ? "null cannot be represented in TOML"
                                   : "Value cannot be represented in TOML");
    return nullptr;
  }

  // The JS layer returns an RFC 3339 string. Let toml++ parse it so that it
  // ends up with the right datetime type.
  std::unique_ptr<::toml::node> ParseDatetime(Local<Value> text) {
    Utf8Value string(isolate_, text);
    std::string document = "v = ";
    document.append(string.out(), string.length());
    ::toml::parse_result result = ::toml::parse(document);
    if (result) {
      const ::toml::node* node = result.table().get("v");
      if (auto value = node->value<::toml::date_time>()) {
        return std::make_unique<::toml::value<::toml::date_time>>(*value);
      }
      if (auto value = node->value<::toml::date>()) {
        return std::make_unique<::toml::value<::toml::date>>(*value);
      }
      if (auto value = node->value<::toml::time>()) {
        return std::make_unique<::toml::value<::toml::time>>(*value);
      }
    }
    THROW_ERR_INVALID_ARG_VALUE(
        isolate_, "Datetime cannot be represented in TOML");
    return nullptr;
  }

  Isolate* isolate_;
  Local<Context> context_;
  Local<Function> format_datetime_;
  Local<Value> object_prototype_;
  LocalVector<Object> ancestors_;
};

// parse(input, bigint, createDatetime, errorInfo)
void Parse(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = env->isolate();
  Local<Context> context = env->context();
  CHECK(args[1]->IsBoolean());
  CHECK(args[2]->IsFunction());
  CHECK(args[3]->IsArray());

  std::unique_ptr<Utf8Value> string_input;
  ArrayBufferViewContents<char> buffer_input;
  std::string_view input;
  if (args[0]->IsString()) {
    string_input = std::make_unique<Utf8Value>(isolate, args[0]);
    input = std::string_view(string_input->out(), string_input->length());
  } else {
    CHECK(args[0]->IsArrayBufferView() || args[0]->IsArrayBuffer() ||
          args[0]->IsSharedArrayBuffer());
    buffer_input.ReadValue(args[0]);
    input = std::string_view(buffer_input.data(), buffer_input.length());
  }

  ::toml::parse_result result = ::toml::parse(input);
  if (!result) {
    const ::toml::parse_error& error = result.error();
    const std::string_view description = error.description();
    const ::toml::source_position& position = error.source().begin;
    Local<Array> info = args[3].As<Array>();
    Local<String> message;
    if (!String::NewFromUtf8(isolate,
                             description.data(),
                             NewStringType::kNormal,
                             static_cast<int>(description.size()))
             .ToLocal(&message) ||
        info->Set(context, 0, message).IsNothing() ||
        info->Set(context,
                  1,
                  Number::New(isolate, static_cast<double>(position.line)))
            .IsNothing()) {
      return;
    }
    const double column = static_cast<double>(position.column);
    USE(info->Set(context, 2, Number::New(isolate, column)));
    return;
  }

  Converter converter(
      isolate, context, args[2].As<Function>(), args[1]->IsTrue());
  Local<Value> value;
  if (converter.Convert(result.table()).ToLocal(&value)) {
    args.GetReturnValue().Set(value);
  }
}

// stringify(value, formatDatetime)
void Stringify(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  Isolate* isolate = env->isolate();
  CHECK(args[1]->IsFunction());

  ::toml::table table;
  Builder builder(isolate, env->context(), args[1].As<Function>());
  if (builder.BuildDocument(args[0], &table).IsNothing()) return;

  std::ostringstream stream;
  stream << ::toml::toml_formatter(table,
                                   ::toml::format_flags::allow_unicode_strings);
  std::string output = std::move(stream).str();
  if (!output.empty() && output.back() != '\n') output.push_back('\n');

  Local<String> result;
  if (!String::NewFromUtf8(isolate,
                           output.data(),
                           NewStringType::kNormal,
                           static_cast<int>(output.size()))
           .ToLocal(&result)) {
    isolate->ThrowException(ERR_STRING_TOO_LONG(isolate));
    return;
  }
  args.GetReturnValue().Set(result);
}

void Initialize(Local<Object> target,
                Local<Value> unused,
                Local<Context> context,
                void* priv) {
  SetMethod(context, target, "parse", Parse);
  SetMethod(context, target, "stringify", Stringify);
}

void RegisterExternalReferences(ExternalReferenceRegistry* registry) {
  registry->Register(Parse);
  registry->Register(Stringify);
}

}  // namespace

}  // namespace toml
}  // namespace node

NODE_BINDING_CONTEXT_AWARE_INTERNAL(toml, node::toml::Initialize)
NODE_BINDING_EXTERNAL_REFERENCE(toml, node::toml::RegisterExternalReferences)
