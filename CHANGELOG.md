# Changelog

## [0.8.0](https://github.com/joberthel/fastify-modern-images/compare/fastify-modern-images-v0.7.0...fastify-modern-images-v0.8.0) (2026-11-14)


### Features

* **#7:** add rotation parameter ([46adac1](https://github.com/joberthel/fastify-modern-images/commit/46adac177ef7fbc5bcc380a0a941201eebe5308e))
* add allowedDimensions and verifyRequest options ([7e639fb](https://github.com/joberthel/fastify-modern-images/commit/7e639fbc9cd6fe447224f8f2f13f01de255feff4)), closes [#55](https://github.com/joberthel/fastify-modern-images/issues/55)
* expose sharpInputOptions for input pixel limits and failOn ([60bedc2](https://github.com/joberthel/fastify-modern-images/commit/60bedc2b8c79430d23cd7e3f39fb3415b0ec96a4)), closes [#48](https://github.com/joberthel/fastify-modern-images/issues/48)
* upgrade to work with fastify 5.x ([fbebd7c](https://github.com/joberthel/fastify-modern-images/commit/fbebd7c76feee88f0da28602ad97059599072b9d))
* wire Fastify request abort signal to removeBackground ([1e5ac59](https://github.com/joberthel/fastify-modern-images/commit/1e5ac59e9bad6368f1b3f6efa24628abf577f91a)), closes [#75](https://github.com/joberthel/fastify-modern-images/issues/75)


### Bug Fixes

* accept number or string for options.quality ([8bcfbee](https://github.com/joberthel/fastify-modern-images/commit/8bcfbee9a3743194a5dabc8b9b75946746c9ba9b))
* add SIGKILL fallback and destroy stdio streams on timeout/abort ([50fa0a0](https://github.com/joberthel/fastify-modern-images/commit/50fa0a08baa1c6be871ff1fdab1ef2d8aaee1acd)), closes [#76](https://github.com/joberthel/fastify-modern-images/issues/76)
* add Vary Accept header on transformed image responses ([e43f927](https://github.com/joberthel/fastify-modern-images/commit/e43f927b10d3b738e7690265b095e587e4104e75))
* allow JPEG for opaque PNG when client explicitly accepts image/jpeg ([c027d30](https://github.com/joberthel/fastify-modern-images/commit/c027d3055203e226fe798ff18b661b90d0ace034)), closes [#80](https://github.com/joberthel/fastify-modern-images/issues/80)
* avoid converting opaque PNGs to lossy JPEGs ([9fa28a5](https://github.com/joberthel/fastify-modern-images/commit/9fa28a599385f5f7d8691817183af42143c881f2)), closes [#34](https://github.com/joberthel/fastify-modern-images/issues/34)
* avoid in-place mutation of defaults via lodash merge ([0ffe257](https://github.com/joberthel/fastify-modern-images/commit/0ffe25781cf3e0234fe4ab4a2fb6d2899b48ea14))
* deduplicate query parsing and pass allowedDimensions to computeDerivedEtag ([703dbfa](https://github.com/joberthel/fastify-modern-images/commit/703dbfa3d6cfeb54ee0e12be74c2475758b8cbd6)), closes [#63](https://github.com/joberthel/fastify-modern-images/issues/63)
* enforce maxInputBytes limit when buffering streams ([41b2348](https://github.com/joberthel/fastify-modern-images/commit/41b234842d615d4865430efaa4d24a83f932c45e)), closes [#50](https://github.com/joberthel/fastify-modern-images/issues/50)
* fix orth typo to north in MinifyQuerystring position ([500b77d](https://github.com/joberthel/fastify-modern-images/commit/500b77dfd340afc7d2f52c6f117c4682b9318aa3))
* gate rembg behind opt-in and add validation and limits ([ec3f5cc](https://github.com/joberthel/fastify-modern-images/commit/ec3f5cc6359710ff5eedb521b51fdc02b9953e65)), closes [#31](https://github.com/joberthel/fastify-modern-images/issues/31)
* guard against querystring array pollution ([57ea4ff](https://github.com/joberthel/fastify-modern-images/commit/57ea4ff6fc6272f36609000deb3cf3b1320b3f74)), closes [#32](https://github.com/joberthel/fastify-modern-images/issues/32)
* handle child process errors and exit codes in removeBackground ([caff297](https://github.com/joberthel/fastify-modern-images/commit/caff2974affee435a3239b8587c267f4ee7047d2))
* handle flatten, early format check, and Accept q=0 ([dc38c08](https://github.com/joberthel/fastify-modern-images/commit/dc38c08fe746b6d868e11e2fde984913658f4f60)), closes [#36](https://github.com/joberthel/fastify-modern-images/issues/36)
* handle removeBackground failures inside try/catch fallback in processPayload ([689531c](https://github.com/joberthel/fastify-modern-images/commit/689531c280b25b56543a9684abf7a2a4b9101f6e)), closes [#66](https://github.com/joberthel/fastify-modern-images/issues/66)
* ignore false and 0 values for trim query parameter ([1a07274](https://github.com/joberthel/fastify-modern-images/commit/1a07274d1c2d9a2fe2d688d064463552ac9b21dc)), closes [#44](https://github.com/joberthel/fastify-modern-images/issues/44)
* improve request coalescing scope and cache key isolation ([e88e2a2](https://github.com/joberthel/fastify-modern-images/commit/e88e2a2c13a990d7542e11b410614f935b8823a0)), closes [#74](https://github.com/joberthel/fastify-modern-images/issues/74)
* include dist directory and run prepublishOnly build ([7d790e0](https://github.com/joberthel/fastify-modern-images/commit/7d790e068bd9835b8677423423108686567aa80f))
* lower default maxDimension, make configurable, and support withoutEnlargement ([8bfe17c](https://github.com/joberthel/fastify-modern-images/commit/8bfe17c578f5828fef4b919b7c4c76263622eac5)), closes [#49](https://github.com/joberthel/fastify-modern-images/issues/49)
* mark shortcut properties in MinifyQuerystring as optional ([d8624e8](https://github.com/joberthel/fastify-modern-images/commit/d8624e8439f7960c3ed940f73d52485ae4bf7fd1))
* measure inputLength before rembg and guard division by zero ([c8a1580](https://github.com/joberthel/fastify-modern-images/commit/c8a15806fbf47b5d4baad53d95e47ca57b29967e)), closes [#43](https://github.com/joberthel/fastify-modern-images/issues/43)
* normalize Content-Type matching in validatePayload ([b112fb0](https://github.com/joberthel/fastify-modern-images/commit/b112fb0599cb3d63c87e80697faa2683e053c81f))
* preserve or bypass animated images (animated WebP / APNG) ([a1cbf37](https://github.com/joberthel/fastify-modern-images/commit/a1cbf3751b8f58f52355fd86aef9af2c63e713bd)), closes [#77](https://github.com/joberthel/fastify-modern-images/issues/77)
* preserve original raw buffer and Content-Type on fallback after rembg ([dc3d439](https://github.com/joberthel/fastify-modern-images/commit/dc3d4397460754d99e37b9c7814d770180d68f69)), closes [#73](https://github.com/joberthel/fastify-modern-images/issues/73)
* prevent double-transformation on multiple plugin registrations ([cc1701e](https://github.com/joberthel/fastify-modern-images/commit/cc1701e8c367034e2f17af575d91e9c3cc5fc266)), closes [#46](https://github.com/joberthel/fastify-modern-images/issues/46)
* reject trailing non-numeric characters in dimension and rotation ([31a12c9](https://github.com/joberthel/fastify-modern-images/commit/31a12c9efab7cf703794d953a77eca0467aae1bc)), closes [#38](https://github.com/joberthel/fastify-modern-images/issues/38)
* remove direct console.error in src/providers/rembg.ts in favor of structured logging ([e86bb39](https://github.com/joberthel/fastify-modern-images/commit/e86bb39b7cc33a2f7f96b03b8879b8661b093ae5)), closes [#68](https://github.com/joberthel/fastify-modern-images/issues/68)
* remove stale ETag header on transformed image responses ([45c01d2](https://github.com/joberthel/fastify-modern-images/commit/45c01d2282dc84a0a55048d67b431892f8da86da))
* remove stray closing parenthesis in request.log.info ([3e9a32c](https://github.com/joberthel/fastify-modern-images/commit/3e9a32cd4930379780ccf936bd870a06d1a50222))
* reset regex lastIndex in guard and clarify Readme ([968cdab](https://github.com/joberthel/fastify-modern-images/commit/968cdabeda46837d586bfac218eca8534ed8b7b0)), closes [#39](https://github.com/joberthel/fastify-modern-images/issues/39)
* resolve all lint errors and warnings ([6a0b236](https://github.com/joberthel/fastify-modern-images/commit/6a0b2366fa0a3ddb0d6b92373dae4a98ffab945c))
* respect client Accept q-factor weights in getBestFormat ([499fa76](https://github.com/joberthel/fastify-modern-images/commit/499fa76b91c315e158757e82ac863b0c3f35093d)), closes [#79](https://github.com/joberthel/fastify-modern-images/issues/79)
* sanitize rembg stderr and add graceful fallback in processPayload ([6227a3b](https://github.com/joberthel/fastify-modern-images/commit/6227a3bf93cd7a73f371971472ff6176bc5cdfed)), closes [#52](https://github.com/joberthel/fastify-modern-images/issues/52)
* scope rembg concurrency limiter per plugin instance instead of module globals ([2cc146e](https://github.com/joberthel/fastify-modern-images/commit/2cc146ec2f5beb162f9e8336fd4641adc8a33d9e)), closes [#64](https://github.com/joberthel/fastify-modern-images/issues/64)
* skip constructor and prototype keys in deepMerge ([56b3064](https://github.com/joberthel/fastify-modern-images/commit/56b306428d758a0edf7ad318c61b0ed2e21530dd)), closes [#53](https://github.com/joberthel/fastify-modern-images/issues/53)
* skip non-200 and non-GET responses and strip Accept-Ranges ([5795942](https://github.com/joberthel/fastify-modern-images/commit/57959428bb7523c7bb550dfb8e105966210c36ed)), closes [#35](https://github.com/joberthel/fastify-modern-images/issues/35)
* specify pnpm version ([eab3dd9](https://github.com/joberthel/fastify-modern-images/commit/eab3dd948507e71c690388d52b709a84e8818b58))
* tighten FUNC_COLOR_RE for rgb and hsl syntax ([c0d53e3](https://github.com/joberthel/fastify-modern-images/commit/c0d53e3e033f181fc0269f16793ee47e7fef6193)), closes [#33](https://github.com/joberthel/fastify-modern-images/issues/33)
* tighten FUNC_COLOR_RE ranges, parseTrim truthy values, and partial dimension fallback ([5570fb2](https://github.com/joberthel/fastify-modern-images/commit/5570fb293f8b254a6f74eb38ea18cb9c8e76e33f)), closes [#78](https://github.com/joberthel/fastify-modern-images/issues/78)
* validate image transformation query parameters at runtime ([128a476](https://github.com/joberthel/fastify-modern-images/commit/128a4765f90e734ed4453f5db842e86984519153))
* validate quality query parameter with fallback ([b924e83](https://github.com/joberthel/fastify-modern-images/commit/b924e8358e263b47d79590c3da8075cb4a0933fb)), closes [#37](https://github.com/joberthel/fastify-modern-images/issues/37)


### Performance Improvements

* pre-normalize validContentTypes once during plugin registration ([ae4a724](https://github.com/joberthel/fastify-modern-images/commit/ae4a7244c2dfa80ff638b52cdd48fe9c8ec5acb5)), closes [#81](https://github.com/joberthel/fastify-modern-images/issues/81)
* short-circuit 304 Not Modified before stream buffering, rembg, and sharp decoding ([f2d0932](https://github.com/joberthel/fastify-modern-images/commit/f2d0932cc833f41a776b0a33bb72010c7dbf9b92)), closes [#72](https://github.com/joberthel/fastify-modern-images/issues/72)
* support derived ETag, 304 Not Modified, and request coalescing ([d40e380](https://github.com/joberthel/fastify-modern-images/commit/d40e380b7a9d80d6137dbe79fbc9dcd3c8a7d7be)), closes [#47](https://github.com/joberthel/fastify-modern-images/issues/47)
