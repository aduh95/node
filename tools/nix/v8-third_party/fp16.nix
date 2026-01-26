{
  stdenv,
  fetchgit,
  skipCheck ? false, # update-v8-dep-nix.sh uses this to parse the file
}:

let
  # Values from deps/v8/DEPS - third_party/fp16
  url = "https://chromium.googlesource.com/external/github.com/Maratyszcza/FP16.git";
  rev = "3d2de1816307bac63c16a297e8c4dc501b4076df";

  pname = "fp16";
  hash = import ./utils/up-to-date-hash.nix {
    inherit
      pname
      skipCheck
      url
      rev
      ;
  } "sha256-CR7h1d9RFE86l6btk4N8vbQxy0KQDxSMvckbiO87JEg=";
in
stdenv.mkDerivation {
  inherit pname;
  version = "0-unstable-2022-10-24";

  src = fetchgit {
    inherit url rev hash;
  };

  doBuild = false;
  installPhase = ''
    install -Dm0644 include/${pname}.h -t $out/include/third_party/${pname}/src/include
    install -Dm0644 include/${pname}/*.h -t $out/include/third_party/${pname}/src/include/${pname}
    ln -s $out/include/third_party/${pname}/src/include/${pname} $out/include/${pname}
  '';
}
