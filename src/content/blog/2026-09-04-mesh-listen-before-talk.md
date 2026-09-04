---
title: When two mesh radios talk at once
description: MeshCore's August firmware reworks how a repeater senses a busy channel before it transmits — the shared-airtime problem that costs the most where relays are few.
pubDate: 2026-09-04
tag: Tech
author: Signal Desk
---

On a single radio channel, only one station can be heard at a time. If two transmit at once, they step on each other and both messages are lost — so a well-behaved radio listens first and waits for a gap before it keys up. That politeness does quiet, constant work in a LoRa mesh — the network of low-power radios that pass short text messages hop to hop when there is no cell tower in the path — and MeshCore's newest firmware reworks how it happens.

[MeshCore's v1.17.0 release](https://blog.meshcore.io/2026/08/09/release-1-17-0), out August 9, rebuilt the part of the firmware that decides when the channel is clear. The project describes the change in its release notes as one that "could be the most significant performance improvement for all meshes."

## Listening on a shared channel

The idea is older than radio itself: take turns on a shared line. In networking it goes by listen-before-talk — a station checks whether the channel is busy and holds off until it falls quiet. On a LoRa radio there are two ways to run that check. One is a hardware feature called channel activity detection, or CAD, where the radio chip itself sniffs for a signal. The other is to do the sensing in software, watching the radio's own status flags.

MeshCore leans on the software path, and 1.17.0 fixes two long-standing faults in it: [cases where the radio's interrupt flags "get 'stuck,'" and — "the big one" — proper detection of a packet's preamble](https://blog.meshcore.io/2026/08/09/release-1-17-0), the short lead-in a receiver uses to recognize that a real transmission is starting. Miss the preamble and a node can begin talking over a message already in the air.

The project's own summary is that the reworked software scheme now "performs on par with hardware CAD, but without the 4 second lock-up glitches that CAD still suffers from" — which is why MeshCore still ships with hardware CAD switched off. That is a trade-off stated plainly: both methods detect a busy channel, and the software one avoids a stall the hardware one has not shaken.

Why this matters in terrain like ours: where a network is built from a small number of deliberately placed ridgeline repeaters — MeshCore's design, and the reason it suits canyon country — those few relays share the airtime among themselves. With fewer nodes, each collision costs proportionally more, because there is no thick swarm of alternate paths to paper over a lost packet. Cleaner listen-before-talk is worth the most exactly where repeaters are sparse.

## If you run a node

Two practical notes for anyone actually flashing a MeshCore device. First, 1.17.0 migrates a node's stored settings to a new JSON format automatically on upgrade; the [release notes](https://blog.meshcore.io/2026/08/09/release-1-17-0) say the old binary configuration is left in place, so a node can still be rolled back to older firmware if needed. Second, a patch — [v1.17.1](https://blog.meshcore.io/2026/08/14/release-1-17-1), August 14 — followed five days later with further radio fixes, and it is the one to flash rather than the .0.

Collision avoidance is invisible when it works. On a mesh of only a few solar repeaters, the difference is a message that arrives on the first try instead of the third.

Curious about the network? Get in touch via the [contact page](/contact).
