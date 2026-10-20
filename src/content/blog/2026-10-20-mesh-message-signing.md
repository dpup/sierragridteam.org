---
title: What signed messages add to a LoRa mesh
description: Mesh firmware is starting to sign messages with a per-node key, so a receiver can check who sent a message as well as keep outsiders from reading it.
pubDate: 2026-10-20
tag: Tech
author: Signal Desk
---

A LoRa mesh is a network of low-power radios that pass short text messages from one radio to the next, with no cell tower or internet in the path. In a foothill power outage, it may be how a neighbor's message reaches you. Meshtastic 2.8, announced this month, adds a way for a receiver to confirm who sent a message.

## What channel encryption covers

Meshtastic, one of the common mesh platforms, [encrypts each channel with a pre-shared key](https://meshtastic.org/docs/overview/encryption) that every node on the channel holds. A 16-byte key gives AES-128 encryption and a 32-byte key gives AES-256. A listener without the key cannot read the messages.

Every node that holds the key can also send on the channel, under any name. The project's documentation says that ["anyone with a channel's key can send an unsigned packet that claims to come from any node"](https://meshtastic.org/docs/overview/encryption), and it advises receivers to treat the named sender "as a claim, not a proof."

Older Meshtastic firmware had a related weakness. A [security advisory](https://github.com/meshtastic/firmware/security/advisories/GHSA-45vg-3f35-7ch2) describes how each node was identified by a number derived from its hardware MAC address rather than from a cryptographic key. An attacker could forge another node's identifying record, and the rest of the network would accept it.

## Signed broadcasts in Meshtastic 2.8

[Meshtastic 2.8](https://meshtastic.org/blog/lets-talk-about-2-8/), announced October 8, bases node identity on public-key cryptography. A node's number is now derived from its public key, and nodes sign their broadcasts "with their identity key, so a receiver can confirm who sent them." A new signature policy setting has three levels:

- **Compatible**, the default, accepts unsigned packets from older nodes.
- **Balanced** requires a signature from any node that has signed before.
- **Strict** accepts only packets it can verify.

The release is early. Version 2.8.0 was withdrawn after a problem turned up in its packet-signing code. Its replacement, 2.8.1, is an alpha that the project says "isn't ready for wide deployment."

## MeshCore's approach

[MeshCore](https://docs.meshcore.io/faq/), the platform this network is built on, already signs the advert each node broadcasts to announce itself. The public key in that advert is "also signed to prevent spoofing." Group messages are not signed: MeshCore's packet notes list group text as "an (unverified) group text message." A receiver on MeshCore can check who a node is, but cannot check the sender named on a group message.

## For anyone running a node

- Keep firmware current, so the identity and signing changes reach your node as each project releases them.
- When signing is available, set the signature policy with your neighbors' firmware in mind. Strict rejects a forged sender, and it also rejects every node still running older firmware.
