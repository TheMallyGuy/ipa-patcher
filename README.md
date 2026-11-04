# Roblox IPA mod installer

> [!TIP]
> I recommend that you install the patched roblox version in [LiveContainer](https://github.com/LiveContainer/LiveContainer).

> [!WARNING]
> I've not confirmed roblox will ban you for this. Use at your own risk!

custom ipa mod installer thing

written in typescript

# Tips

If you want to embed/integrate this into your bootstrapper or whatever, you can either:

```powershell
bun run buildjs
```

Run this if you decided to use the ipa patcher as an javascript with reference at [modPatch.ts](./src/modPatch.ts)

```powershell
bun run buildcli
```

_Please have bun installed & `bun i` before running these^^_

This command creates `rblx-ptch.exe` or `rblx-ptch.*` depends on your OS you're using.

## Basic usage of the cli:

```powershell
.\rblx-ptch.exe .\com.roblox.robloxmobile.ipa -m ./Froststrap/ -d "patched.ipa"
```

would output like :

```
Patching ExtraContent/textures/ui/LuaChatV2/ic-add-friends.png (99.48%)
Patched ExtraContent/textures/ui/LuaChatV2/ic-add-friends.png (99.66%)
Patching ExtraContent/textures/ui/LuaChatV2/ic-friend-empty-border.png (99.66%)
Patched ExtraContent/textures/ui/LuaChatV2/ic-friend-empty-border.png (99.83%)
Patching info.json (99.83%)
Patched info.json (100.00%)
Patched IPA written to patched.ipa
```

You can use regex to get progress from the output like:

```csharp
// progress report of a file
const regex = @"^(?P<state>Patching|Patched)\s+(?P<file>.+?)\s+\((?P<pct>\d{1,3}(?:\.\d+)?)%\)\s*$/"
```

```csharp
// progress of a file
const regex = @"^Patching\s+(?P<file>.+?)(?:\s+\((?P<pct>\d+(?:\.\d+)?)%\))?\s*$"
```

```csharp
// start of a file being patched
const regex = @"^Patching\s+(?P<file>.+?)(?:\s+\((?P<pct>\d+(?:\.\d+)?)%\))?\s*$"
```

```csharp
// a file finished patching
const regex = @"^Patched\s+(?P<file>.+?)\s+\((?P<pct>\d+(?:\.\d+)?)%\)\s*$"
```

```csharp
// final done
const regex = @"^Patched IPA written to\s+(?P<path>.+?)\s*$"
```

## Trusted sources to get `.ipa` from

[ios-runner](https://github.com/Roblox-DeployHistory-Updates/ios-runner/releases)
