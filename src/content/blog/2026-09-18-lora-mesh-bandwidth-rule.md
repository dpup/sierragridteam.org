---
title: What the 500 kHz rule means for LoRa mesh
description: A decades-old FCC bandwidth rule sits under the default channel settings of Meshtastic and MeshCore, and bringing a mesh into line is a whole-network decision, not a quiet toggle.
pubDate: 2026-09-18
tag: Tech
author: Signal Desk
---

The small radios that pass short text messages when the cell towers are down all share one channel, and the width of that channel is set by a number in the firmware. A decades-old FCC rule has a number of its own — and for the most common LoRa mesh settings in the United States, the two do not match. "LoRa mesh" here means the network of low-power radios that relay messages hop to hop with no cell tower in the path.

## The rule and the defaults

The 900 MHz band these radios use is shared, unlicensed spectrum, and the FCC sets terms for it. One of them, [47 CFR 15.247(a)(2)](https://www.law.cornell.edu/cfr/text/47/15.247), covers digital modulation in the 902–928 MHz band and states plainly: "The minimum 6 dB bandwidth shall be at least 500 kHz."

The presets most operators actually run sit under that floor. Meshtastic's default, Long Fast, is [250 kHz](https://meshtastic.org/docs/overview/radio-settings/). MeshCore's "USA Recommended" preset is [62.5 kHz](https://github.com/meshcore-dev/MeshCore/issues/945). Both defaults are narrower than the 500 kHz the rule names for digital modulation, and a user flashing a radio off the shelf gets that narrow setting without being told there is a question attached to it.

The question was raised inside the projects themselves. A [MeshCore issue opened October 15, 2025](https://github.com/meshcore-dev/MeshCore/issues/945) proposed a compliant 500 kHz preset and argued the narrow defaults fall outside 15.247. It debated for months — whether that section is even the right one, since there are other doors in the rules — and it surfaced to a wider audience this month when [Hackaday](https://hackaday.com/2026/09/17/fcc-ism-rules-may-shatter-lora-mesh-communities/) covered it on September 17. It is an open argument, not a settled ruling.

## Why moving is not free

Widening a channel is a real trade, not a free upgrade. A group in Philadelphia, Philly Mesh, [tested 500 kHz through the summer](https://phillymesh.net/2026/09/02/fcc-regulations/) and found the wider channel exposed them to _more_ in-band interference, not less — at 250 kHz they could keep the noise at the edges of the channel, and at 500 kHz they could not dodge it anywhere. They made the wider setting work by moving to MeshCore, which handled the noisier spectrum better in their testing. A wider channel also lowers a receiver's sensitivity, so operators claw the link budget back by slowing the data rate: the MeshCore proposal's own 500 kHz configuration trades roughly a quarter of the throughput for its wider, compliant channel.

Then there is the part that makes this disruptive out of proportion to its size. A mesh only works when every radio shares the same bandwidth, frequency, and spreading factor. A radio on 250 kHz and a radio on 500 kHz cannot hear each other at all. So this is not a fix a network applies one node at a time — the moment some radios move and others do not, one mesh becomes two.

## What it means for a node here

For anyone in the foothills standing up their own LoRa node — a household relay, a few neighbors on a shared channel — the practical read is to treat the channel preset as a decision, not a default. Know the number your radio ships on, know that the common ones sit under the FCC's 500 kHz digital-modulation floor, and agree on the setting with whoever you mean to reach before anything goes up on a mast. A radio on the wrong width is a radio nobody hears.

The rule is old; the flood of inexpensive LoRa radios is what turned a quiet default into a live question. For anyone still building a mesh, the cheapest time to settle on a channel width is at the start — before there is a deployed network whose every radio has to be visited to change one number.

Curious about the network? Get in touch via the [contact page](/contact).
