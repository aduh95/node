{
  pkgs ? import ./tools/nix/pkgs.nix { },

  # Optional build tools / config
  ccache ? pkgs.ccache,
  loadJSBuiltinsDynamically ? true, # Load `lib/**.js` from disk instead of embedding
  ninja ? pkgs.ninja,
  extraConfigFlags ? [
    "--debug-node"
  ],
  useSeparateDerivationForV8 ? false, # to help CI better managed its binary cache, not recommended outside of CI usage.

  # Build options
  icu ? pkgs.icu,
  withAmaro ? true,
  withLief ? true,
  withQuic ? false,
  withSQLite ? true,
  withSSL ? true,
  withTemporal ? false,
  sharedLibDeps ? (
    import ./tools/nix/sharedLibDeps.nix {
      inherit
        pkgs
        withLief
        withQuic
        withSQLite
        withSSL
        withTemporal
        ;
    }
  ),

  # dev tools (not needed to build Node.js, useful to maintain it)
  ncu-path ? null, # Provide this if you want to use a local version of NCU
  devTools ? import ./tools/nix/devTools.nix { inherit pkgs ncu-path; },
  benchmarkTools ? import ./tools/nix/benchmarkTools.nix { inherit pkgs; },
}:

let
  useSharedICU = if builtins.isString icu then icu == "system" else icu != null;
  useSharedAda = builtins.hasAttr "ada" sharedLibDeps;
  useSharedOpenSSL = builtins.hasAttr "openssl" sharedLibDeps;

  needsRustCompiler = withTemporal && !builtins.hasAttr "temporal_capi" sharedLibDeps;

  nativeBuildInputs =
    pkgs.nodejs-slim_latest.nativeBuildInputs
    ++ pkgs.lib.optionals needsRustCompiler [
      pkgs.cargo
      pkgs.rustc
    ];
  buildInputs =
    pkgs.lib.optional useSharedICU icu ++ pkgs.lib.optional withTemporal sharedLibDeps.temporal_capi;

  # Put here only the configure flags that affect the V8 build
  configureFlags = [
    (
      if icu == null then
        "--without-intl"
      else
        "--with-intl=${if useSharedICU then "system" else icu}-icu"
    )
  ]
  ++ extraConfigFlags
  ++ pkgs.lib.optionals withTemporal [
    "--v8-enable-temporal-support"
    "--shared-temporal_capi"
  ];
in
pkgs.mkShell {
  inherit nativeBuildInputs;

  buildInputs =
    builtins.attrValues sharedLibDeps
    ++ buildInputs
    ++ pkgs.lib.optional (useSeparateDerivationForV8 != false) (
      if useSeparateDerivationForV8 == true then
        pkgs.callPackage ./tools/nix/v8.nix {
          inherit
            configureFlags
            buildInputs
            nativeBuildInputs
            ;
        }
      else
        useSeparateDerivationForV8
    );

  packages = devTools ++ benchmarkTools ++ pkgs.lib.optional (ccache != null) ccache;

  shellHook = pkgs.lib.optionalString (ccache != null) ''
    export CC="${pkgs.lib.getExe ccache} $CC"
    export CXX="${pkgs.lib.getExe ccache} $CXX"
  '';

  BUILD_WITH = if (ninja != null) then "ninja" else "make";
  NINJA = pkgs.lib.optionalString (ninja != null) "${pkgs.lib.getExe ninja}";
  CI_SKIP_TESTS = pkgs.lib.concatStringsSep "," (
    [ ]
    ++ pkgs.lib.optionals useSharedAda [
      # Different versions of Ada affect the WPT tests
      "test-url"
    ]
    ++ pkgs.lib.optionals useSharedOpenSSL [
      # Path to the openssl.cnf is different from the expected one
      "test-strace-openat-openssl"
    ]
  );
  CONFIG_FLAGS = builtins.toString (
    configureFlags
    ++ pkgs.lib.optional (ninja != null) "--ninja"
    ++ pkgs.lib.optional (!withAmaro) "--without-amaro"
    ++ pkgs.lib.optional (!withLief) "--without-lief"
    ++ pkgs.lib.optional withQuic "--experimental-quic"
    ++ pkgs.lib.optional (!withSQLite) "--without-sqlite"
    ++ pkgs.lib.optional (!withSSL) "--without-ssl"
    ++ pkgs.lib.optional loadJSBuiltinsDynamically "--node-builtin-modules-path=${builtins.toString ./.}"
    ++ pkgs.lib.optional (useSeparateDerivationForV8 != false) "--without-bundled-v8"
    ++
      pkgs.lib.concatMap
        (name: [
          "--shared-${name}"
          "--shared-${name}-libpath=${pkgs.lib.getLib sharedLibDeps.${name}}/lib"
          "--shared-${name}-include=${pkgs.lib.getInclude sharedLibDeps.${name}}/include"
        ])
        (
          builtins.attrNames (
            if (useSeparateDerivationForV8 != false) then
              builtins.removeAttrs sharedLibDeps [ "simdutf" "temporal_capi" ]
            else
              sharedLibDeps
          )
        )
  );
  NOSQLITE = pkgs.lib.optionalString (!withSQLite) "1";
}
