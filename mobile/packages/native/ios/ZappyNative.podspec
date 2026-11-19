# ZappyOne's own iPhone code (Live Activities today), next to the Android module in ../android.
Pod::Spec.new do |s|
  s.name           = 'ZappyNative'
  s.version        = '1.0.0'
  s.summary        = 'ZappyOne native features for iOS'
  s.author         = 'ZappyOne'
  s.homepage       = 'https://www.zappyone.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.9'
end
