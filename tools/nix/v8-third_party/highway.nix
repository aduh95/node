{
  fetchgit,
  libhwy,
  skipCheck ? false, # update-v8-dep-nix.sh uses this to parse the file
}:

let
  # Values from deps/v8/DEPS - third_party/highway
  url = "https://chromium.googlesource.com/external/github.com/google/highway.git";
  rev = "84379d1c73de9681b54fbe1c035a23c7bd5d272d";

  hash = import ./utils/up-to-date-hash.nix {
    pname = "highway";
    inherit skipCheck url rev;
  } "sha256-HNrlqtAs1vKCoSJ5TASs34XhzjEbLW+ISco1NQON+BI=";
in
libhwy.overrideAttrs (old: {
  version = "1.3.0";

  src = fetchgit {
    inherit url rev hash;
  };

  postPatch = ''
    substituteInPlace hwy/ops/set_macros-inl.h \
       --replace-fail '",avx10.2-512"' '""'
  '';

  doCheck = false;
})
