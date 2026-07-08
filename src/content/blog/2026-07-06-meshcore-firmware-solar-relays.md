---
title: What MeshCore 1.16 means for solar relay sites
description: MeshCore's June firmware release trims a repeater's background chatter and power draw, the kind of change that matters most on a short winter day.
pubDate: 2026-07-06
tag: Tech
author: Signal Desk
---

A repeater running on solar power lives or dies by its power budget. On the shortest days of the year, a panel might see four or five hours of usable light, and every watt the radio spends on housekeeping is a watt not banked for the night. [MeshCore's firmware release 1.16.0](https://blog.meshcore.io/2026/06/06/release-1-16-0), out June 6, trims that housekeeping in a way worth understanding.

[MeshCore](https://github.com/meshcore-dev/MeshCore), the routing protocol behind this kind of off-grid LoRa mesh — a network of radios that relay messages hop by hop when there is no cell tower to carry them — does not flood every packet to every node the way some mesh platforms do. It leans on a smaller number of deliberately placed repeaters holding known paths between them, a design suited to ridgeline terrain where a handful of well-sited relays cover more ground than a dense swarm of cheap nodes could. That design only pays off if the housekeeping traffic between those repeaters stays light. There are fewer of them to split the airtime, and each one runs on stored sun.

The clearest change in 1.16.0 is to that housekeeping. Repeaters periodically send an "advert" — a short broadcast announcing that a node exists and is reachable, which is how the mesh learns and refreshes its routes. The default interval between adverts has been stretched from 12 hours to 47, and a new setting, `flood.max.advert`, limits how far an advertisement floods by default to 8 hops. In a network where the physical layout of repeaters barely changes week to week, routes do not need refreshing every half day. A repeater keying up roughly four times less often for the same housekeeping is a direct cut in the radio-on time that drains a battery fastest.

The release pairs that with general power-saving work in the ESP32-based repeater firmware, plus an auto-shutdown feature for the battery-powered companion units volunteers carry in the field, one that disables itself automatically when a device is running on external power instead.

None of this changes what a repeater can do. It changes how much of its stored energy goes toward doing it. For a network of solar sites rather than mains-powered towers, that is the more useful kind of firmware update: not a new feature, just a quieter radio.

Curious about the network? Get in touch via the [contact page](/contact).
