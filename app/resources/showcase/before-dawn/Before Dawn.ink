// Before Dawn — scenic reader edition, revision 97.
// Written by Elias Wren (fictional pen name).
// Collect Mara's lantern and hear the caravan bells to unlock the third ending.
VAR has_lantern = false
VAR heard_caravan = false

-> village

=== village ===
# screen
#bg: image/background/reading-texture.png
#image: image/scene/village-square.jpg
#music: audio/music/night-path.mp3
#sound: audio/sfx/wind.wav
#title: The Last Star
The village of Rivermere has forgotten what warmth feels like.

Frost covers the windows. The hearths have gone cold. Above the rooftops, the last star of winter flickers in a sky that refuses to brighten.

At the square, an old bell rings once.

Mara, the blacksmith, finds you watching the star.

"My sister is out there," she whispers. "With the caravan. They won't find the pass without that light."

She looks toward the dark houses.

"But if we bring the star down, it could warm Rivermere until spring."

The star trembles.

There may not be enough light for everyone.

{has_lantern: The lantern at your side glows faintly.}
{heard_caravan: You remember the distant caravan bells beyond the bridge.}

+ {not has_lantern} [Visit Mara at the old forge.] -> forge
+ {not heard_caravan} [Look for the caravan at the bridge.] -> bridge
+ [Climb the hill toward the star.] -> hill

=== forge ===
# screen
#bg: image/background/reading-texture.png
#image: image/scene/forge-street.jpg
#music: audio/music/forge-embers.mp3
#sound: audio/sfx/forge.wav
#title: The Old Forge
The forge is almost dark. Its last embers glow beneath the ash.

Mara takes an old lantern from a shelf. The glass is scratched, and the handle is blackened by years of use.

"My father made this," she says. "He believed a light given freely could become more than it was."

She hesitates.

"I never knew what he meant."

Outside, the star pulses faintly, as if listening.

{has_lantern: The lantern she gave you is still warm in your hand.}

+ {not has_lantern} [Take the lantern and go to the bridge.]
    ~ has_lantern = true
    -> bridge
+ {not has_lantern} [Take the lantern and climb the hill.]
    ~ has_lantern = true
    -> hill
+ {not has_lantern} [Leave the lantern behind.] -> hill
+ {has_lantern} [Go to the bridge.] -> bridge
+ {has_lantern} [Climb the hill.] -> hill

=== bridge ===
# screen
#bg: image/background/reading-texture.png
#image: image/scene/bridge-bell.jpg
#music: audio/music/bridge-mist.mp3
#sound: audio/sfx/bell.wav
#title: Voices in the Snow
~ heard_caravan = true
The old bridge groans beneath the weight of winter.

Beyond it lies the mountain pass. The wind carries something through the darkness.

A bell. Then a voice, distant and frightened.

The caravan is still moving, but it is heading toward the ravine.

They are closer than Mara feared.

And the star is growing dimmer.

+ [Climb toward the star.] -> hill
+ {not has_lantern} [Return to Mara's forge.] -> forge
+ [Return to Rivermere.] -> village

=== hill ===
# screen
#bg: image/background/reading-texture.png
#image: image/scene/last-star.jpg
#music: audio/music/star-vigil.mp3
#sound: audio/sfx/chime.wav
#title: A Light to Give
At the top of the hill, an ancient stone holds the last star in its orbit.

Its glow is scarcely larger than a candle flame.

Beneath you, Rivermere waits in the cold.

Beyond the mountains, the caravan struggles toward a road it can no longer see.

You reach for the star. It responds to your hand.

For one brief moment, you hold the fate of both in your palm.

{has_lantern: The lantern at your side grows warm.}

+ [Bring the star down to warm Rivermere.] -> ending_village
+ [Send the star toward the caravan.] -> ending_caravan
+ {has_lantern and heard_caravan} [Try to share the light with the lantern.] -> ending_shared
+ {not has_lantern} [Return to Mara's forge.] -> forge
+ {not heard_caravan} [Investigate the bridge.] -> bridge
+ [Return to Rivermere.] -> village

=== ending_village ===
# screen
#bg: image/background/reading-texture.png
#image: image/scene/village-dawn.jpg
#music: audio/music/first-light.mp3
#sound: audio/sfx/birds.wav
#title: A Warm Dawn
The star falls like a golden tear.

Warmth flows through Rivermere. Ice releases its hold on the windows. Fires spring to life, and the villagers emerge to welcome a morning they thought they would never see.

Mara stands beside you, watching the mountain road.

No caravan appears.

She thanks you for saving the village. But her eyes never leave the distant pass.

You have given Rivermere its dawn.

And somewhere beyond the mountains, the night remains.

Some lights save us. Others show us what we have lost.

-> END

=== ending_caravan ===
# screen
#bg: image/background/reading-texture.png
#image: image/scene/caravan-dawn.jpg
#music: audio/music/first-light.mp3
#sound: audio/sfx/footsteps.wav
#title: The Way Home
You release the star into the eastern sky.

It burns bright above the mountain pass, revealing the hidden road. Far below, the caravan turns away from the ravine.

By morning, Mara's sister returns.

They embrace in the village square, laughing through their tears.

Yet Rivermere's hearths remain cold. Winter has not released its grip.

Mara takes your hand.

"You brought her home," she says. "We'll find another way to survive."

The first pale dawn rises over a frozen village.

Hope does not always arrive with warmth.

-> END

=== ending_shared ===
# screen
#bg: image/background/reading-texture.png
#image: image/scene/shared-light.jpg
#music: audio/music/first-light.mp3
#sound: audio/sfx/chime.wav
#title: The Borrowed Star
You open Mara's lantern beneath the trembling star.

For a moment, nothing happens.

Then you remember the voices at the bridge. The people waiting in Rivermere. Mara, holding on to the hope of seeing her sister again.

You do not ask the star to choose.

You ask it to shine.

Its light passes through the lantern's glass and divides into a thousand golden threads.

Some fall upon Rivermere, kindling the sleeping hearths.

Others stretch across the mountains, illuminating the road home.

When the caravan enters the village at dawn, Mara runs to meet her sister.

Above them, the star fades.

The lantern remains lit.

And for the first time in a very long winter, Rivermere welcomes a sunrise that belongs to everyone.

Light is not always lost when it is given away.

-> END
