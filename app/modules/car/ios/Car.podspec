Pod::Spec.new do |s|
  s.name           = 'Car'
  s.version        = '1.0.0'
  s.summary        = 'CarPlay browse tree and transport for the phone app.'
  s.description    = 'Local Expo module: holds the browse tree published by JS and renders it as CarPlay templates.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
