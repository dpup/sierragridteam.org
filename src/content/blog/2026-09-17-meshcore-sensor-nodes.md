---
title: Turning a mesh radio into a sensor
description: A new MeshCore write-up covers turning a mesh radio into a small instrument — one that can report temperature, humidity, or battery state from a place with no cell signal and no power.
pubDate: 2026-09-17
tag: Tech
author: Signal Desk
---

The conditions that matter most in fire country are often measured in the hardest places to reach: a ridgetop with no power line, a canyon with no cell signal. A recent write-up from the MeshCore project is a reminder that the same low-power radios built to carry text between those places can also be built to carry a reading out of them.

MeshCore is the software this kind of network runs on — a LoRa mesh, the web of low-power radios that pass short text messages hop to hop when there is no cell tower in the path. On September 14, the project's lead firmware developer [published an introduction](https://blog.meshcore.io/2026/09/14/sensor-intro) to a node type most people never see: the sensor node.

## Not a download

Start with the honest limit, because the post does. Unlike the ready-made repeater and messaging builds the project ships, there is no finished sensor node to flash. It is a firmware template you compile yourself — the write-up is plain that "there simply are too many customisations that typically would be required to accommodate, and there would be thousands of variants." Building one means the developer's toolchain: VSCode with the PlatformIO extension, the firmware repository, and a board definition of your own. This is a maker's project, not a product off a shelf.

## What it can read

What a sensor node measures depends on the chip you wire to it, and the framework already handles a long list of the common ones. Among them are parts that read temperature, humidity, and barometric pressure, and others that watch the current and voltage of a battery or solar supply. The first group is the interesting one for this terrain: temperature and relative humidity are two of the readings that describe how dry the air and fuels are getting. Getting those out of a spot that has no other data path is a genuinely useful thing.

## Four ways to move a reading

The part worth the attention is how a sensor node shares what it measures. The post lays out four modes. A remote node can **query** it and pull the latest reading on demand. It can raise an **alert** when a value crosses a line — either a high-priority message that asks for acknowledgment, or a low-priority one it sends once and forgets. It can keep a rolling **time series** in a small circular buffer and answer questions about it, like the minimum, maximum, or average over a window. And an emerging fourth option lets it **push** an update only when a reading changes by more than a set amount.

That last mode is where the design meets the terrain. On a mesh built from a few solar-powered relays, airtime and battery are the scarce resources, and a node that transmits every reading on a fixed timer spends both whether the number moved or not. Reporting only on a real change trades a complete record for restraint — fewer transmissions, less power, less shared channel used up — which is the right trade where transmissions are expensive. It is the same economy behind a radio that listens before it talks: spend the channel when there is something to say.

None of this is plug-and-play, and the post does not pretend otherwise. But for a reader who can flash firmware, it is a concrete project — and a working example of how a place with no grid and no cell bars can still put a number on the network.

Curious about the network? Get in touch via the [contact page](/contact).
