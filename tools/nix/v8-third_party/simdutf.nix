{
  stdenv,
  fetchgit,
  cmake,
  skipCheck ? false, # update-v8-dep-nix.sh uses this to parse the file
}:

let
  # Values from deps/v8/DEPS - third_party/simdutf
  url = "https://chromium.googlesource.com/chromium/src/third_party/simdutf";
  rev = "acd71a451c1bcb808b7c3a77e0242052909e381e";

  pname = "simdutf";
  hash = import ./utils/up-to-date-hash.nix {
    inherit
      pname
      skipCheck
      url
      rev
      ;
  } "sha256-2fW4Bz1BWJp8EZqZBvvEuoI3Szfepe8muF8v9KpGk7E=";
  version = "7.3.3";
in
stdenv.mkDerivation {
  inherit pname version;

  src = fetchgit {
    inherit url rev hash;
  };

  buildPhase =
    if stdenv.buildPlatform.isDarwin then
      ''
        $CXX -std=c++20 -dynamiclib simdutf.cpp \
          -o libsimdutf.dylib \
          -install_name $out/lib/libsimdutf.dylib
      ''
    else
      ''
        $CXX -std=c++20 -fPIC -shared simdutf.cpp \
          -o libsimdutf.so
      '';
  installPhase = ''
    install -Dm0644 libsimdutf.* -t $out/lib
    install -Dm0644 simdutf.h -t $out/include/third_party/simdutf

    cat -> simdutf.pc <<EOF
      Name: simdutf
      Description: Fast Unicode validation, transcoding and processing
      Version: ${version}
      Libs: -L$out/lib -lsimdutf
      Cflags: -I$out/include/third_party/simdutf
    EOF
    install -Dm0644 simdutf.pc -t $out/lib/pkgconfig
  '';
}
