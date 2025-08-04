{
  pkgs ? import <nixpkgs> {},
  loadJSBuiltinsDynamically ? true, # Load `lib/**.js` from disk instead of embedding
  ncu-path ? null, # Provide this if you want to use a local version of NCU
  shared-icu ? pkgs.icu,
  sharedLibDeps ? {
    inherit (pkgs)
      ada
      brotli
      c-ares
      libuv
      nghttp2
      nghttp3
      ngtcp2
      openssl
      simdjson
      sqlite
      zlib
      zstd
    ;
    http-parser = pkgs.llhttp;
    simdutf = pkgs.simdutf.overrideAttrs {
      version = "6.5.0";

      src = pkgs.fetchFromGitHub {
        owner = "simdutf";
        repo = "simdutf";
        rev = "v6.5.0";
        hash = "sha256-bZ4r62GMz2Dkd3fKTJhelitaA8jUBaDjG6jOysEg8Nk=";
      };
    };
  },
  ccache ? pkgs.ccache,
  ninja ? pkgs.ninja,
  devTools ? [
    pkgs.curl
    pkgs.gh
    pkgs.git
    pkgs.jq
    pkgs.shellcheck
  ] ++ (if (ncu-path == null) then [
      pkgs.node-core-utils
    ] else [
      (pkgs.writeShellScriptBin "git-node" "exec \"${ncu-path}/bin/git-node.js\" \"$@\"")
      (pkgs.writeShellScriptBin "ncu-ci" "exec \"${ncu-path}/bin/ncu-ci.js\" \"$@\"")
      (pkgs.writeShellScriptBin "ncu-config" "exec \"${ncu-path}/bin/ncu-config.js\" \"$@\"")
    ]),
  benchmarkTools ? [
    pkgs.R
    pkgs.rPackages.ggplot2
    pkgs.rPackages.plyr
  ],
  extraConfigFlags ? [
    "--without-npm"
    "--debug-node"
  ],
}:

let
  useSharedICU = if builtins.isString shared-icu then shared-icu == "system" else shared-icu != null;
  useSharedAda = builtins.hasAttr "ada" sharedLibDeps;
in
pkgs.mkShell {
  inherit (pkgs.nodejs_latest) nativeBuildInputs;

  TEST = if useSharedICU then "true" else "false";
  buildInputs = builtins.attrValues sharedLibDeps ++ pkgs.lib.optionals useSharedICU [ shared-icu ];

  packages = [
    ccache
  ] ++ devTools ++ benchmarkTools;

  shellHook = ''
    export CC="${pkgs.lib.getExe ccache} $CC"
    export CXX="${pkgs.lib.getExe ccache} $CXX"
  '';

  BUILD_WITH = if (ninja != null) then "ninja" else "make";
  NINJA = if (ninja != null) then "${pkgs.lib.getExe ninja}" else "";
  CI_SKIP_TESTS="${
    pkgs.lib.concatStringsSep "," ([
    ] ++ pkgs.lib.optionals useSharedAda [
      # Different versions of Ada affect the WPT tests
      "test-url"
    ])
  }";
  CONFIG_FLAGS = builtins.toString ([
    (if shared-icu == null
      then "--without-intl"
      else "--with-intl=${if useSharedICU then "system" else shared-icu}-icu")
  ] ++ extraConfigFlags ++ pkgs.lib.optionals (ninja != null) [
    "--ninja"
  ] ++ pkgs.lib.optionals loadJSBuiltinsDynamically [
    "--node-builtin-modules-path=${builtins.toString ./.}"
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
