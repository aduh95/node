{
  stdenv,
  fetchgit,
  cmake,
  skipCheck ? false, # update-v8-dep-nix.sh uses this to parse the file
}:

let
  # Values from deps/v8/DEPS - third_party/zlib
  url = "https://chromium.googlesource.com/chromium/src/third_party/zlib.git";
  rev = "85f05b0835f934e52772efc308baa80cdd491838";

  hash = import ./utils/up-to-date-hash.nix {
    pname = "zlib";
    inherit skipCheck url rev;
  } "sha256-d01Vdo+kZ43AhES5MYGFae67fH6L6ATh3xQadMu7Hw0=";
in
stdenv.mkDerivation (finalAttrs: {
  pname = "v8_zlib";
  version = "1.3.1";

  src = fetchgit {
    inherit url rev hash;
  };
  postPatch = ''
    substituteInPlace CMakeLists.txt \
      --replace-fail 'OUTPUT_NAME z' 'OUTPUT_NAME v8_zlib' \
      --replace-fail 'set_target_properties(zlib PROPERTIES LINK_FLAGS "-Wl,--version-script,\"''${CMAKE_CURRENT_SOURCE_DIR}/zlib.map\"")' ' ' \
      --replace-fail 'INSTALL_INC_DIR "''${CMAKE_INSTALL_PREFIX}/include"' 'INSTALL_INC_DIR "''${CMAKE_INSTALL_PREFIX}/include/third_party/zlib"' \
      --replace-fail 'set(ZLIB_PUBLIC_HDRS' 'set(ZLIB_PUBLIC_HDRS chromeconf.h google/compression_utils_portable.h' \
      --replace-fail 'set(ZLIB_SRCS' 'set(ZLIB_SRCS google/compression_utils_portable.cc'
  '';

  NIX_CFLAGS_COMPILE = ''
    -DZLIB_IMPLEMENTATION
    -include ${finalAttrs.src}/chromeconf.h
  '';

  nativeBuildInputs = [ cmake ];
  postInstall = ''
    mkdir $out/include/third_party/zlib/google
    mv $out/include/third_party/zlib/compression_utils_portable.h $out/include/third_party/zlib/google/.
  '';
})
