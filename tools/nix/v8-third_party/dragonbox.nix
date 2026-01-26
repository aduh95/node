{
  stdenv,
  fetchgit,
  skipCheck ? false, # update-v8-dep-nix.sh uses this to parse the file
}:

let
  # Values from deps/v8/DEPS - third_party/dragonbox
  url = "https://chromium.googlesource.com/external/github.com/jk-jeon/dragonbox.git";
  rev = "6c7c925b571d54486b9ffae8d9d18a822801cbda";

  pname = "dragonbox";
  hash = import ./utils/up-to-date-hash.nix {
    inherit
      pname
      skipCheck
      url
      rev
      ;
  } "sha256-AOniXMPgwKpkJqivRd+GazEnhdw53FzhxKqG+GdU+cc=";
in
stdenv.mkDerivation {
  inherit pname;
  version = "1.8.0";

  src = fetchgit {
    inherit url rev hash;
  };

  doBuild = false;
  installPhase = ''
    install -Dm0644 include/${pname}/*.h -t $out/include/third_party/${pname}/src/include/${pname}
  '';
}
