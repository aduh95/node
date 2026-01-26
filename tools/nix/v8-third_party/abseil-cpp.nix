{
  abseil-cpp,
  fetchgit,
  skipCheck ? false, # update-absl-nix.sh uses this to parse the file
}:

let
  url = "https://chromium.googlesource.com/chromium/src/third_party/abseil-cpp.git";
  rev = "3fb321d9764442ceaf2e17b6e68ab6b6836bc78a";

  hash = import ./utils/up-to-date-hash.nix {
    pname = "abseil-cpp";
    inherit skipCheck url rev;
  } "sha256-KpjXpyWp9x0cSmyh3uwn0fwKreHA0Cb8c0rD+RHYB80=";
in
(abseil-cpp.overrideAttrs {
  src = fetchgit {
    inherit url rev hash;
  };
}).dev
