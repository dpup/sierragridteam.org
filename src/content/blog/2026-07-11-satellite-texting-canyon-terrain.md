---
title: What satellite texting can't do in a canyon
description: Satellite texting is spreading to ordinary phones, but the same open-sky requirement that makes it work is also what blocks it in canyon terrain.
pubDate: 2026-07-11
tag: Tech
author: Signal Desk
---

Newer phones can send a text with no cell signal at all now, by talking straight to a satellite instead of a tower. It is a genuine capability, not a gimmick, and it is spreading fast. It also has one blind spot worth understanding before anyone in the foothills treats it as a stand-in for a local network.

Two things get lumped together under "satellite phone" now. Apple's Emergency SOS via satellite has shipped on iPhones since 2022, connecting directly to a satellite to relay a short emergency message when there is no cellular signal. [T-Satellite](https://www.t-mobile.com/coverage/satellite-phone-service), T-Mobile's newer partnership with SpaceX's Starlink constellation, goes further — ordinary texting, photo sharing, and even WhatsApp calls over satellite, working automatically on most smartphones from the last four years regardless of carrier, or for $10 a month if you are not a T-Mobile customer. Both point a phone's radio straight up rather than sideways at a cell tower.

That same straight-up path is the limitation. [Apple's own support guidance](https://support.apple.com/en-us/105097) for satellite connectivity is specific about what defeats it: dense foliage can block the connection outright, light foliage slows it, and hills, mountains, canyons, and tall structures can block it too. The feature wants open sky — a ridgetop or an open meadow — not the inside of a canyon under conifer cover, which describes a fair amount of the Highway 4 and Highway 49 corridors.

That is the same constraint MeshCore repeaters are sited around. MeshCore is the mesh-networking software behind S.I.E.R.R.A's LoRa relays — the radios that pass a message hand to hand when there is no cell tower to carry it — and the reason the two technologies solve the line-of-sight problem differently. A satellite link is one hop, straight up, with no alternate path — block that single view of the sky and the message does not move. A mesh network is built from many short hops between fixed points chosen for ridgeline line-of-sight to each other; if a message cannot move directly from a canyon floor to a saddle, it can often still move sideways, hop to hop, to a repeater that does have the view. Redundancy comes from having multiple paths, not one better antenna.

Satellite texting is still a real improvement over having nothing — as a backup layer in a pack or a glovebox, and in places no ridgeline repeater ever will reach, like open water or a summit above treeline. It is not yet a substitute for infrastructure built to work from inside the terrain rather than above it. A satellite text needs a hole in the sky. A mesh hop only needs a neighbor with one.

Curious about the network? Get in touch via the [contact page](/contact).
