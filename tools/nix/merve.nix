{
  lib,
  cmake,
  fetchFromGitHub,
  simdutf,
  gtest,
  nix-update-script,
  stdenv,
  testers,
  validatePkgConfig,
  static ? stdenv.hostPlatform.isStatic,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "merve";
  version = "1.0.0-unstable";

  src = fetchFromGitHub {
    # owner = "nodejs";
    owner = "anonrig";
    repo = "merve";
    # tag = "v${finalAttrs.version}";
    rev = "d499aa984deebff754bf4ed09ac89aeebadcdcaa";
    hash = "sha256-4B6q03mwDNKgTZ1XlC0fM+0FvxLA+aC8ITtg0hWk6Ak=";
  };

  doCheck = true;
  cmakeFlags = [
    (lib.cmakeBool "BUILD_SHARED_LIBS" (!static))
    (lib.cmakeBool "MERVE_TESTING" finalAttrs.finalPackage.doCheck)
    (lib.cmakeBool "MERVE_USE_SIMDUTF" true)
  ];

  nativeBuildInputs = [
    cmake
    validatePkgConfig
  ];
  buildInputs = [
    simdutf
  ];
  checkInputs = [
    gtest
  ];

  passthru = {
    updateScript = nix-update-script { };

    tests.pkg-config = testers.hasPkgConfigModules {
      package = finalAttrs.finalPackage;
    };
  };

  meta = {
    description = "Lexer to extract named exports via analysis from CommonJS modules";
    homepage = "https://github.com/nodejs/merve";
    changelog = "https://github.com/nodejs/merve/releases/tag/v${finalAttrs.version}";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ aduh95 ];
    platforms = lib.platforms.all;
    pkgConfigModules = [ "merve" ];
  };
})
