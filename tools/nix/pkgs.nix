arg:
let
  repo = "https://github.com/NixOS/nixpkgs";
  rev = "e5ead30d0824debba629dcf0720abeddee57b7d6";
  nixpkgs = builtins.fetchTarball {
    url = "${repo}/archive/${rev}.tar.gz";
    sha256 = "0sydiakqjp2qhr8h573bv48ng8928rjpwkx600xmxvsyz8kwczn1";
  };
in
# Unstable channel no longer supports Intel architecture for macOS. We can use the 26.05 channel
# to keep testing on that platform for a little longer.
# TODO: remove this when 26.05 is EOL (end of 2026)
import (if builtins.currentSystem == "x86_64-darwin" then ./pkgs-26.05.nix else nixpkgs) (
  arg
  // ({
    overlays = (arg.overlays or [ ]) ++ [
      (final: old: {
        # TODO: remove this once the pin we use has picked up https://github.com/NixOS/nixpkgs/pull/557405
        simdutf = old.simdutf.overrideAttrs (
          old:
          final.lib.optionalAttrs (final.lib.versionAtLeast "8.0.0" old.version) {
            cmakeFlags = old.cmakeFlags ++ [ (final.lib.cmakeFeature "SIMDUTF_CXX_STANDARD" "20") ];
          }
        );
      })
    ];
  })
)
