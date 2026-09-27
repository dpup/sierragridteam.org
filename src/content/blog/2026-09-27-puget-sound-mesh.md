---
title: What holds a regional mesh together
description: Puget Mesh, a volunteer LoRa network on the same MeshCore platform this one runs, spans the Pacific Northwest — and how it got there is a lesson in what actually carries a mesh.
pubDate: 2026-09-27
tag: Field Report
author: Signal Desk
---

A LoRa mesh — the network of low-power radios that pass short text messages hop to hop when there is no cell tower in the path — is easy to picture as a pile of handheld gadgets. The reach of a working one comes from something else, and a volunteer network up in the Pacific Northwest is a clear look at what.

Puget Mesh is a volunteer-led group building [off-grid, community-owned networks](https://pugetmesh.org/) across the Puget Sound region. Its main network runs [MeshCore](https://pugetmesh.org/meshcore/) — the same platform this network is built on — alongside AREDN, a high-speed data mesh for licensed amateur radio operators, and an older Meshtastic network it now treats as legacy.

## Who carries the traffic

What makes that span possible is a design decision about which radios move a message. In MeshCore, [an ordinary client radio does not repeat](https://docs.meshcore.io/faq/) — "only repeaters and room servers" set to repeat pass a message along. And rather than flood every message across every node the way Meshtastic does, a MeshCore node discovers a path to its destination and reuses it. The trade is real: the first message to a new destination still floods, and a route has to be found before traffic settles. The payoff is that adding client radios does not add work the whole mesh has to carry — so the network stays usable as it grows.

So the thing that extends a MeshCore mesh is a repeater, not another handheld. Puget Mesh publishes a [standard repeater build](https://pugetmesh.org/meshcore/repeater_setup/) that reads like the whole lesson on one page: put the antenna up high — a mast or a rooftop, clear of obstructions; give the repeater a name that hints at where it sits, a landmark or cross streets; and run the region's agreed radio settings, which for them is 910.525 MHz at 62.5 kHz bandwidth, spreading factor 7. Each one is registered so it appears in the shared map the community uses to see the network.

## Agreement is the other half

Everyone on the same settings, named the same way, is what lets a mesh grow past one town without collapsing into noise. The Pacific Northwest groups have taken that further: Puget Mesh and its neighbors are working toward [shared region naming conventions](https://gessaman.com/meshcore/regions/), so traffic can be scoped by area as the map fills in. The knowledge spreads as deliberately as the hardware: Puget Mesh runs beginner MeshCore classes through [neighborhood emergency hubs](https://seattleemergencyhubs.org/calendar-event/meshcore-intro-class/).

The read for anyone in the foothills weighing a mesh node is that coverage is not a purchase. A radio on the kitchen table is a client: useful to its owner, invisible to the network's reach. What extends a mesh in terrain like ours is a repeater placed where it can see — a ridgeline, a rooftop above the treeline — running the same settings as its neighbors and named so the next operator knows what they are hearing. Puget Mesh is that discipline made visible: a mesh's reach is built repeater by repeater, on shared conventions and deliberate placement, and the building happens well before anyone needs it.
