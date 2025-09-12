arg:
let
  repo = "https://github.com/NixOS/nixpkgs";
  rev = "d33e926c80e6521a55da380a4c4c44a7462af405";
  nixpkgs = import (builtins.fetchTarball {
    url = "${repo}/archive/${rev}.tar.gz";
    sha256 = "1j0ir1f9zv9y674apv7fnmmhr0qf8bjnh7qv6ia47bbs1pzxgr2x";
  }) arg;
in
nixpkgs
