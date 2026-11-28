{
  'targets': [
    {
      'target_name': 'tomlplusplus',
      'type': 'none',
      'direct_dependent_settings': {
        'include_dirs': ['.'],
        'defines': [
          'TOML_EXCEPTIONS=0',
          'TOML_ENABLE_WINDOWS_COMPAT=0',
        ],
      },
    },
  ]
}
