arg:
let
  repo = "https://github.com/NixOS/nixpkgs";
  rev = "c0f3d81a7ddbc2b1332be0d8481a672b4f6004d6";
  nixpkgs = import (builtins.fetchTarball {
    url = "${repo}/archive/${rev}.tar.gz";
    sha256 = "0gm6wnh9x7rhzp9akcmg4pjs9k691k6439dahyjb0880bvqgkq9h";
  }) arg;
in
nixpkgs
