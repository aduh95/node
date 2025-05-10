{ pkgs ? import <nixpkgs> {}, ncu-path ? null, shared-icu ? pkgs.icu, sharedLibDeps ? {
    inherit (pkgs)
      ada
      brotli
      c-ares
      libuv
      nghttp3
      ngtcp2
      openssl
      simdjson
      # Trying to use shared simdutf breaks the build.
      # simdutf
      sqlite
      zlib
      zstd
    ;
    http-parser = pkgs.llhttp;
  }
}:

let
  useSharedICU = if builtins.isString shared-icu then shared-icu == "system" else shared-icu != null;
  useSharedAda = builtins.hasAttr "ada" sharedLibDeps;
in
pkgs.mkShell {
  inherit (pkgs.nodejs_latest) nativeBuildInputs;

  buildInputs = builtins.attrValues sharedLibDeps ++ pkgs.lib.optionals useSharedICU [ shared-icu ];

  packages = [
    pkgs.ccache
    pkgs.curl
    pkgs.gh
    pkgs.git
    pkgs.jq
  ] ++ pkgs.lib.optionals (ncu-path != null) [
    (pkgs.writeShellScriptBin "git-node" "exec \"${ncu-path}/bin/git-node.js\" \"$@\"")
    (pkgs.writeShellScriptBin "ncu-ci" "exec \"${ncu-path}/bin/ncu-ci.js\" \"$@\"")
    (pkgs.writeShellScriptBin "ncu-config" "exec \"${ncu-path}/bin/ncu-config.js\" \"$@\"")
  ] ++ pkgs.lib.optionals (ncu-path == null) [
    pkgs.node-core-utils
  ];

  CC = "ccache cc";
  CXX = "ccache c++";
  CI_SKIP_TESTS="${
    pkgs.lib.concatStringsSep "," ([
    ] ++ pkgs.lib.optionals useSharedAda [
      # Different versions of Ada affect the WPT tests
      "test-url"
    ])
  }";
  CONFIG_FLAGS = builtins.toString ([
    "--ninja"
    "--node-builtin-modules-path=${builtins.toString ./.}"
    (if shared-icu == null
      then "--without-intl"
      else "--with-intl=${if useSharedICU then "system" else shared-icu}-icu")
    "--without-npm"
    "--debug-node"
    "--verbose"
  ] ++ pkgs.lib.concatMap (name: [
    "--shared-${builtins.replaceStrings [ "c-ares" ] [ "cares" ] name}"
    "--shared-${builtins.replaceStrings [ "c-ares" ] [ "cares" ] name}-libpath=${
      pkgs.lib.getLib sharedLibDeps.${name}
    }/lib"
    "--shared-${builtins.replaceStrings [ "c-ares" ] [ "cares" ] name}-include=${
      pkgs.lib.getInclude sharedLibDeps.${name}
    }/include"
  ]) (builtins.attrNames sharedLibDeps));
}
