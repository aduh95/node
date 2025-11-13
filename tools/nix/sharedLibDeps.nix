{
  pkgs ? import ./pkgs.nix { },
  withTemporal ? false,
}:
{
  inherit (pkgs)
    ada
    brotli
    c-ares
    libuv
    nghttp3
    ngtcp2
    simdjson
    simdutf
    sqlite
    uvwasi
    zlib
    zstd
    ;
  http-parser = pkgs.llhttp;
  nghttp2 = pkgs.nghttp2.overrideAttrs {
    patches = [
      (pkgs.fetchpatch2 {
        url = "https://github.com/nghttp2/nghttp2/commit/7784fa979d0bcf801a35f1afbb25fb048d815cd7.patch?full_index=1";
        revert = true;
        excludes = [ "lib/includes/nghttp2/nghttp2.h" ];
        hash = "sha256-RG87Qifjpl7HTP9ac2JwHj2XAbDlFgOpAnpZX3ET6gU=";
      })
    ];
  };
  openssl = pkgs.openssl.overrideAttrs (old: {
    version = "3.5.4";
    src = pkgs.fetchurl {
      url = builtins.replaceStrings [ old.version ] [ "3.5.4" ] old.src.url;
      hash = "sha256-lnMR+ElVMWlpvbHY1LmDcY70IzhjnGIexMNP3e81Xpk=";
    };
    doCheck = false;
    configureFlags = (old.configureFlags or [ ]) ++ [
      "no-docs"
      "no-tests"
    ];
    outputs = [
      "bin"
      "out"
      "dev"
    ];
  });
}
// (pkgs.lib.optionalAttrs withTemporal {
  temporal_capi =
    import
      (builtins.fetchurl {
        url = "https://github.com/NixOS/nixpkgs/raw/c2247d3f04fe4da90a09244acc1df2f8b3dd6cfa/pkgs/by-name/te/temporal_capi/package.nix";
        sha256 = "1igiqjsw7jnb15xy0a5jq7z1wrpypflv37qidq056vsd1p2fks69";
      })
      {
        inherit (pkgs)
          lib
          stdenv
          rustPlatform
          fetchFromGitHub
          nix-update-script
          testers
          ;
      };
})
