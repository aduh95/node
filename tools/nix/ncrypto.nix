{
  lib,
  cmake,
  fetchFromGitHub,
  fetchpatch2,
  gtest,
  openssl,
  nix-update-script,
  stdenv,
  testers,
  validatePkgConfig,
  static ? stdenv.hostPlatform.isStatic,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "ncrypto";
  version = "1.0.2-unstable";

  src = fetchFromGitHub {
    owner = "nodejs";
    repo = "ncrypto";
    # tag = "v${finalAttrs.version}";
    rev = "7e4a1bdeed104dd389b2744982712d24e49c3383";
    hash = "sha256-Tq5BclGO38ZhT7v5vBaj3WeCkSUBIUx5QCDTUm9+aqo=";
  };

  nativeBuildInputs = [
    cmake
    validatePkgConfig
  ];
  buildInputs = [ openssl ];

  doCheck = true;
  checkInputs = [ gtest ];
  cmakeFlags = [
    (lib.cmakeBool "BUILD_SHARED_LIBS" (!static))
    (lib.cmakeBool "NCRYPTO_SHARED_LIBS" true)
    (lib.cmakeBool "NCRYPTO_TESTING" finalAttrs.finalPackage.doCheck)
  ];

  passthru = {
    updateScript = nix-update-script { };

    tests.pkg-config = testers.hasPkgConfigModules {
      package = finalAttrs.finalPackage;
      checkVersion = true;
    };
  };

  meta = {
    description = "Library of byte handling functions extracted from Node.js core";
    homepage = "https://github.com/nodejs/ncrypto";
    changelog = "https://github.com/nodejs/ncrypto/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ aduh95 ];
    platforms = lib.platforms.all;
    pkgConfigModules = [ "ncrypto" ];
  };
})
