{
  callPackage,
  symlinkJoin,
  writeTextFile,
}:

let
  version =
    let
      v8Version = builtins.match (
        ".*#define V8_MAJOR_VERSION ([0-9]+).*"
        + "#define V8_MINOR_VERSION ([0-9]+).*"
        + "#define V8_BUILD_NUMBER ([0-9]+).*"
        + "#define V8_PATCH_LEVEL ([0-9]+).*"
      ) (builtins.readFile ../../../deps/v8/include/v8-version.h);
    in
    if v8Version == null then
      throw "V8 version not found"
    else
      "${builtins.elemAt v8Version 0}.${builtins.elemAt v8Version 1}.${builtins.elemAt v8Version 2}.${builtins.elemAt v8Version 3}";
in
symlinkJoin {
  pname = "v8-third_party";
  inherit version;

  paths = [
    (callPackage ./abseil-cpp.nix { })
    (callPackage ./dragonbox.nix { })
    (callPackage ./fast_float.nix { })
    (callPackage ./fp16.nix { })
    (callPackage ./googletest.nix { })
    (callPackage ./highway.nix { })
    (callPackage ./simdutf.nix { })
    (callPackage ./zlib.nix { })
  ];
  postBuild = ''
    cat -> v8-third_party.pc <<EOF
      Name: v8-third_party
      Description: V8 JavaScript Engine third party required for Node.js
      Version: 0.0.0
      Libs: -L$out/lib ${
        builtins.toString [
          "-labsl_base"
          "-labsl_city"
          "-labsl_civil_time"
          "-labsl_debugging_internal"
          "-labsl_demangle_internal"
          "-labsl_graphcycles_internal"
          "-labsl_hash"
          "-labsl_int128"
          "-labsl_kernel_timeout_internal"
          "-labsl_malloc_internal"
          "-labsl_raw_hash_set"
          "-labsl_raw_logging_internal"
          "-labsl_spinlock_wait"
          "-labsl_stacktrace"
          "-labsl_str_format_internal"
          "-labsl_strings_internal"
          "-labsl_strings"
          "-labsl_symbolize"
          "-labsl_synchronization"
          "-labsl_throw_delegate"
          "-labsl_time_zone"
          "-labsl_time"
          "-lhwy"
          "-lsimdutf"
          "-lv8_zlib"
        ]
      }
      Cflags: -I$out/include -I$out/include/third_party/simdutf
    EOF
    install -Dm0644 v8-third_party.pc -t $out/lib/pkgconfig
  '';
}
