{
  stdenv,
  fetchgit,
  skipCheck ? false, # update-v8-dep-nix.sh uses this to parse the file
}:

let
  # Values from deps/v8/DEPS - third_party/googletest
  url = "https://chromium.googlesource.com/external/github.com/google/googletest.git";
  rev = "b2b9072ecbe874f5937054653ef8f2731eb0f010";

  pname = "googletest";
  hash = import ./utils/up-to-date-hash.nix {
    inherit
      pname
      skipCheck
      url
      rev
      ;
  } "sha256-cTPx19WAXlyXDK4nY0pxbMI4oRojaARgIeASA+MB3NY=";
in
stdenv.mkDerivation {
  inherit pname;
  version = "1.8.0";

  src = fetchgit {
    inherit url rev hash;
    # sparseCheckout = [ "*.h" ];
    # nonConeMode = true;
  };

  doBuild = false;
  installPhase = ''
    install -Dm0644 googletest/include/gtest/*.h -t $out/include/third_party/${pname}/src/googletest/include/gtest
  '';
}
