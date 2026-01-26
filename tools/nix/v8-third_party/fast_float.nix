{
  stdenv,
  fetchgit,
  skipCheck ? false, # update-v8-dep-nix.sh uses this to parse the file
}:

let
  # Values from deps/v8/DEPS - third_party/fast_float
  url = "https://chromium.googlesource.com/external/github.com/fastfloat/fast_float.git";
  rev = "cb1d42aaa1e14b09e1452cfdef373d051b8c02a4";

  pname = "fast_float";
  hash = import ./utils/up-to-date-hash.nix {
    inherit
      pname
      skipCheck
      url
      rev
      ;
  } "sha256-CG5je117WYyemTe5PTqznDP0bvY5TeXn8Vu1Xh5yUzQ=";
in
stdenv.mkDerivation {
  inherit pname;
  version = "7.0.0";

  src = fetchgit {
    inherit url rev hash;
  };

  doBuild = false;
  installPhase = ''
    install -Dm0644 include/${pname}/*.h -t $out/include/third_party/${pname}/src/include/${pname}
  '';
}
