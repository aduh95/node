{
  pname,
  skipCheck,
  url,
  rev,
}:
hash:
let
  v8Deps = builtins.match (
    ".*'chromium_url': '([^']+)',.*"
    + "'third_party/${pname}(/src)?': ?\\{?"
    + "[^']+('url': ?)?Var\\('chromium_url'\\) ?\\+ ?'([^']+)' ?\\+ ?'@' ?\\+ ?'([a-f0-9]+)',.*"
  ) (builtins.readFile ../../../../deps/v8/DEPS);
  expectedURL =
    if v8Deps == null then
      throw "v8/DEPS missing or not parsable for ${pname}"
    else
      "${builtins.elemAt v8Deps 0}${builtins.elemAt v8Deps 3}";
  expectedRev = builtins.elemAt v8Deps 4;
in
if skipCheck == false && (expectedURL != url || expectedRev != rev) then
  throw "Please run tools/nix/v8-third_party/utils/update-dep-nix.sh ${pname}\n - Expected: ${expectedURL}@${expectedRev}\n - Got:      ${url}@${rev}"
else
  hash
