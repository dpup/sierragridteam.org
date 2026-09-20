---
title: The 500 kHz question facing LoRa mesh
description: A longstanding FCC rule sets a 500 kHz minimum bandwidth for digital radios in the 900 MHz band, and the default LoRa mesh modes sit well below it — which is why node operators are now debating a compliant preset and its trade-offs.
pubDate: 2026-09-20
tag: Tech
author: Signal Desk
---

Anyone in the foothills who has set up a LoRa mesh node — one of the low-power radios that pass short text messages hop to hop when there is no cell tower in the path — chose a radio band and a default configuration without thinking much about either. A regulatory question that has been running in the mesh community since last fall is a good reason to look at what that default actually is.

The band these radios use, 902 to 928 MHz, is one of the unlicensed "ISM" bands — the industrial, scientific, and medical slices of spectrum anyone may transmit on without a license, unlike the amateur or GMRS bands. In exchange, every signal there has to fit the FCC's Part 15 rules for unlicensed devices. One of those rules is now the subject of a long argument among mesh operators.

## The rule and the defaults

[Section 15.247](https://www.law.cornell.edu/cfr/text/47/15.247) of the FCC's rules covers digitally modulated devices in the 900 MHz band. It permits up to 1 watt of power, but attaches a condition: "the minimum 6 dB bandwidth shall be at least 500 kHz." Bandwidth is how wide a slice of the band a signal occupies, and 500 kHz is the floor for operating under this section.

The common LoRa mesh modes sit below that floor. Meshtastic's default "Long Fast" preset uses 250 kHz; [MeshCore's standard US preset uses 62.5 kHz](https://nodakmesh.org/blog/fcc-15-247-500khz-lora). Narrow bandwidth is not an oversight — it is how these radios reach far on very little power. A narrower signal concentrates more energy into less spectrum, which buys range, the currency that matters most in canyon terrain. That same narrowness is what falls short of the 500 kHz line.

## Why it is not settled

The disagreement is about scope, not the number. The section's own opening line covers "frequency hopping and digitally modulated intentional radiators." Operators dispute whether LoRa's chirp spread-spectrum scheme qualifies as "digitally modulated" under the FCC's definition — which is the question that decides whether 15.247's 500 kHz floor applies at all. A separate section, [15.249](https://www.law.cornell.edu/cfr/text/47/15.249), sets no bandwidth minimum but caps power at a tiny fraction of a watt. And the FCC has made no public comment on any of these projects. The main thread, [MeshCore issue #945](https://github.com/meshcore-dev/MeshCore/issues/945), opened in October 2025 and still unresolved, precisely because no official word has settled it.

## The trade a compliant preset carries

MeshCore now ships a compliant "MeshCore 500" preset — [902.250 MHz, 500 kHz bandwidth, spreading factor 11](https://phillymesh.net/2026/09/02/fcc-regulations/). Moving to it is not free. Philadelphia's mesh group, testing the wider signal in a dense urban RF environment, found it more exposed to interference; a narrower mode ["was better able to slip through some of the interference"](https://hackaday.com/2026/09/17/fcc-ism-rules-may-shatter-lora-mesh-communities/). A change of bandwidth also fragments a network: a 500 kHz node cannot hear a 250 kHz or 62.5 kHz one, so early movers split off from everyone who has not switched.

## What to take from it

The practical step for a node operator is to know which configuration the radio is actually running — the band, the preset, the bandwidth — and under which rule it claims to operate, rather than assume the out-of-box setting is the last word. That is the cost that rides along with unlicensed spectrum: the same Part 15 that lets a mesh node transmit with no exam and no fee also fixes the terms it has to meet, and those terms are, for now, genuinely contested. The place to watch for a resolution is the rule text and the project threads themselves — the FCC has not published one, and no forum post substitutes for it.

Curious about the network? Get in touch via the [contact page](/contact).
