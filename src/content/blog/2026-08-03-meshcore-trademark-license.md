---
title: What the MeshCore trademark fight can't touch
description: A former contributor has moved to trademark the MeshCore name, but the firmware the project ships is MIT-licensed and stays open no matter who ends up owning the name.
pubDate: 2026-08-03
tag: Tech
author: Signal Desk
---

The open-source software that runs the LoRa mesh relays in these foothills has spent the summer in a legal dispute — not over how it works, but over its name. It is worth understanding what that fight does and does not put at risk.

MeshCore is the routing protocol S.I.E.R.R.A's solar relays run on: the software that lets a network of low-power LoRa radios pass short text messages hop by hop when there is no cell tower in the path. After a split in the project's core team earlier this year, a former member filed to register "MeshCore" as a trademark — in the United Kingdom in late March and the European Union in April, by [the project's own account](https://blog.meshcore.io/2026/07/04/help-us-save-meshcore). The remaining team, which treats the name as the community's, is opposing both filings. As of [late July](https://blog.meshcore.io/2026/07/28/thankyou) the opposition is formally lodged and the trademark sits in "opposed" status — in the team's own words, "a waiting game," with no guaranteed outcome. The project estimated roughly $18,000 in legal fees to see it through and [raised that through a community fundraiser](https://givealittle.co.nz/cause/help-us-save-meshcore) that concluded in late July.

That is the news. The more useful part is what a trademark actually governs.

## A name and its code are separate things

A trademark is a claim on a name and a logo — on branding. It is not a claim on software. MeshCore's firmware and core libraries are released under the [MIT License](https://github.com/meshcore-dev/MeshCore), one of the most permissive open-source licenses there is: anyone may use, modify, and redistribute the code, for any purpose, commercial included. That grant is already made. It cannot be pulled back by a later dispute over the name, and it does not depend on who wins one.

So whatever a trademark office eventually decides, the code already on a repeater stays exactly as free to use as it was — still readable, patchable, and rebuildable by whoever maintains it. The project has said development carries on regardless, with a 1.17 firmware release in progress.

## Why the license is the part that matters

This is the quiet argument for building resilient infrastructure on open-source rather than a vendor's product. A company can fold. A product can be discontinued and its servers switched off. A brand can be sold or contested, as this one is now. None of that reaches MIT-licensed code that is already in hand — the version compiled onto a relay is yours to keep, run, and maintain even if everything else about the project changed tomorrow.

For anyone deciding whether to put weekends into learning a platform — or a district weighing what to standardize on — the license is the part worth reading first. It is what separates infrastructure you operate from infrastructure you only rent. The MeshCore name may be settled by a trademark office over the coming months. The terms that let a community depend on the software were settled the day the code was published under a license that cannot be revoked.
