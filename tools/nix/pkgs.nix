arg:
let
  repo = "https://github.com/NixOS/nixpkgs";
  rev = "02f2cb8e0feb4596d20cc52fda73ccee960e3538";
  nixpkgs = import (builtins.fetchTarball {
    url = "${repo}/archive/${rev}.tar.gz";
    sha256 = "0k4za9vmdxpz5jixspyz2ypc25ymcxijpssgwaacz6l9fcgg0zdl";
  }) arg;
in
nixpkgs
