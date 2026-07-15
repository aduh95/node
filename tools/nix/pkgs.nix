arg:
let
  repo = "https://github.com/NixOS/nixpkgs";
  rev = "a1ddb745f852935c2986bc9cda001a9d954965e5";
  nixpkgs = import (builtins.fetchTarball {
    url = "${repo}/archive/${rev}.tar.gz";
    sha256 = "0aiardyh6zzrp39cliypfwmmsnbmkbbgnwsndzdldffw7jgij30c";
  }) (arg // { overlays = (arg.overlays or [ ]) ++ [ (import ./R-overlay.nix) ]; });
in
# Unstable channel no longer supports Intel architecture for macOS. We can use the 26.05 channel
# to keep testing on that platform for a little longer.
# TODO: remove this when 26.05 is EOL (end of 2026)
if builtins.currentSystem == "x86_64-darwin" then (import ./pkgs-26.05.nix arg) else nixpkgs
