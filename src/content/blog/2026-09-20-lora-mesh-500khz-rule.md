---
title: The 500 kHz question facing LoRa mesh
description: A longstanding FCC rule sets a 500 kHz minimum 6 dB bandwidth for digital systems in the 900 MHz band; MeshCore's recommended US preset stays narrower while Meshtastic now defaults new US nodes to a 500 kHz mode — and operators are weighing what the wider signal costs.
pubDate: 2026-09-20
tag: Tech
author: Signal Desk
---

Anyone in the foothills who has set up a LoRa mesh node — one of the low-power radios that pass short text messages hop to hop when there is no cell tower in the path — chose a band and a default configuration without thinking much about either. A regulatory question running in the mesh community since last fall is reason to look at what that default actually is.

The band these radios use, 902 to 928 MHz, is an ISM band — the industrial, scientific, and medical slice of spectrum — heavily used by unlicensed Part 15 devices. Operating under Part 15 takes no individual radio license, unlike the amateur or GMRS bands, but the device and how it transmits still have to meet the FCC's technical rules. One of those rules is now the subject of a long argument among mesh operators.

## The rule and the defaults

[Section 15.247](https://www.law.cornell.edu/cfr/text/47/15.247) of the FCC's rules covers digitally modulated devices in the 900 MHz band. For a system using digital modulation it allows up to 1 watt of conducted output power — subject to other limits, including a power spectral density no greater than 8 dBm in any 3 kHz — and requires a minimum 6 dB bandwidth of at least 500 kHz. That floor is the condition at issue.

The common narrow LoRa modes sit below it. [MeshCore's recommended US preset](https://docs.meshcore.io/faq/) runs at 62.5 kHz, and Meshtastic's long-standing "Long Fast" preset uses 250 kHz. Meshtastic has begun to move: as of [version 2.8](https://github.com/meshtastic/firmware/releases/tag/v2.8.0.47db0e3), a new US node choosing its region for the first time defaults to "LongTurbo," a 500 kHz mode, rather than LongFast.

## What bandwidth means here

A radio signal does not sit on a single frequency — it spreads across a range of them, and bandwidth is how wide that range is. The 250 or 500 kHz figure on a LoRa radio is its nominal modulation bandwidth, the setting the operator picks; the FCC rule is written in terms of the signal's measured 6 dB bandwidth — closely related, but not the same measurement.

Width is only part of the range story. At a fixed spreading factor and transmit power, a wider signal takes in more background noise, so the receiver is less sensitive — though it clears each transmission faster. But bandwidth is not the only knob: LoRa's spreading factor sets how far each bit is stretched out in time, and a higher factor slows the data while letting a receiver pull the signal out of weaker conditions. [Philadelphia's mesh group](https://phillymesh.net/2026/09/02/fcc-regulations/), sketching a compliant configuration, offsets the wider channel with a higher spreading factor — from 62.5 kHz at spreading factor 7 to 500 kHz at spreading factor 11 — and calculates the link budget as roughly comparable, even slightly better, at a lower data rate.

## What is actually contested

There is still real disagreement about how these rules apply to a fixed-channel LoRa network, but the evidence leans one way. Substantial support exists for treating LoRa as a digital transmission system under §15.247 — the section with the 500 kHz floor. [Semtech's own FCC guidance](https://www.mouser.com/pdfDocs/AN120062_BestPracticesforFCC_Rev_1_0_FINAL.pdf) applies that requirement to LoRa, and it is the path LoRa devices are [certified under](https://www.sunfiretesting.com/LoRa-FCC-Certification-Guide/). What the FCC has not done is address these projects by name: no public guidance naming Meshtastic or MeshCore could be found.

The alternative operators point to is [15.249](https://www.law.cornell.edu/cfr/text/47/15.249), which sets no bandwidth minimum but limits the fundamental signal to 50 mV/m measured at 3 meters — a much lower effective transmit level than typical LoRa mesh operation. The main thread, [MeshCore issue #945](https://github.com/meshcore-dev/MeshCore/issues/945), opened in October 2025 and is still open.

## The trade a compliant preset carries

No compliant preset ships in MeshCore's US firmware today. What exists is a community recommendation: the Philadelphia group's custom "MeshCore 500" configuration — 902.250 MHz, 500 kHz bandwidth, spreading factor 11, coding rate 4/5 — while the upstream proposal for a regulatory US preset stays open and MeshCore's documented US recommendation remains the narrower 62.5 kHz mode.

Moving to the wider channel is not free. Testing it in a dense urban RF environment, the Philadelphia group found the signal more exposed to interference; a narrower mode ["was better able to slip through some of the interference"](https://hackaday.com/2026/09/17/fcc-ism-rules-may-shatter-lora-mesh-communities/). And changing radio parameters can split a network: nodes at 500 kHz and spreading factor 11 cannot directly decode nodes still on 250 or 62.5 kHz, so a migration divides the mesh unless the other nodes are reconfigured or something bridges them. Meshtastic gives the same warning about its new LongTurbo default and the old LongFast — the two cannot hear each other.
