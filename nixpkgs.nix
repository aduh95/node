arg:
let
  repo = "https://github.com/NixOS/nixpkgs";
  rev = "1cef900e590ea97fb326b74dfff77d23e5e9f8c1";
  nixpkgs = import (builtins.fetchTarball {
    url = "${repo}/archive/${rev}.tar.gz";
    sha256 = "10460nq82m1gwjcmg36qjbrimi3zpb9wyhwmlbz6ayjgbff8drwj";
  }) arg;
in
nixpkgs
