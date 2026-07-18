---
title: Satellite texting's blind spot on Highway 4
description: Phones that text over satellite when there's no cell signal need a clear view of the sky — the same canyon walls and tree canopy that block cell towers can block satellites too.
pubDate: 2026-07-17
tag: Tech
author: Signal Desk
---

Most phones sold in the last few years can send a text over satellite when there is no cell tower in range. It sounds like the gap in coverage is solved. It is not — the fix has a blind spot, and it is the same terrain that causes the original problem.

Apple's Emergency SOS via satellite has shipped since 2022, and carriers have caught up: [T-Mobile's T-Satellite](https://www.t-mobile.com/coverage/satellite-phone-service), built on SpaceX's Starlink direct-to-cell satellites, now carries iMessage and Google Messages texts and WhatsApp voice chat, not just emergency alerts. Verizon and AT&T are backing a competing satellite network, [AST SpaceMobile, which is targeting service launches later in 2026](https://www.lightreading.com/satellite/ast-spacemobile-targets-intermittent-national-coverage-in-early-2026). None of it needs a special device — it works with a phone already in a pocket.

It also needs a working line of sight to a satellite in low orbit, several hundred miles up, and that requirement is stricter than it sounds. [Apple's own documentation](https://support.apple.com/en-us/101573) is specific: connecting requires being outside on relatively open terrain with a clear view of the sky and horizon. Light tree foliage slows a message to over a minute; heavy foliage can block the connection outright. Hills, mountains, canyons, and tall structures block it the same way. T-Mobile's guidance on T-Satellite says the same thing in different words — a clear view of the sky gets the best signal, and dense tree canopy or a deep canyon will weaken or block it.

That is a description of the Highway 4 corridor. Long stretches run through canyon walls and under conifer canopy, the identical geometry that already keeps cell towers from reaching a lot of the foothills. A phone that cannot see a cell tower from inside a canyon often cannot see a satellite from the same spot either. The obstruction is the same physics working against a different kind of receiver.

A LoRa mesh — low-power radios that pass a message hand to hand between fixed relay sites instead of through a cell tower — built on [MeshCore](https://github.com/meshcore-dev/MeshCore) answers to a different requirement: not a view of orbit, but a view of the next relay in the chain. A repeater sited to see the next repeater down the line, and that one the next after it, gets a message around a ridge instead of needing a straight shot through the sky above it. Ground relays and orbital satellites fail for opposite reasons, which is exactly why one is not a backup for the other so much as a different tool for different ground.

Satellite texting earns its keep in the place mesh cannot help: open ground with no repeater nearby and a clear sky overhead — a ridge trail, a meadow, the shoulder of a road with a wide view. Mesh earns its keep in the place satellite struggles most: down in the canyon, under the trees, exactly where a lot of the corridor's homes and roads sit. Knowing which kind of ground someone is standing on, tree cover or open sky, says more about which device in a pocket has a chance of getting a message out than any spec sheet does.

Curious about the network? Get in touch via the [contact page](/contact).
