**Dave Clements** [7:01 PM]  
I don't remember if I have you flight path? If so I should remove it.

**João Victor Barbosa Carvalho** [11:07 AM]  
what do you mean?

**Dave Clements** [11:07 AM]  
Did I put all the data points for a flight in that file? Or just airports?

**João Victor Barbosa Carvalho** [11:08 AM]  
All data points, in a parameter called "path"

**Dave Clements** [11:09 AM]  
You don't need those right? Or are you using them?

**João Victor Barbosa Carvalho** [11:13 AM]  
Yes, they’re useful, quick explanation below.

I’m not drawing every intermediate `path` point directly as the on-screen line (yet, because I’m still balancing performance and readability), but I am using that data for flight logic, especially to understand where the flight actually crosses and how it should relate to country focus.

So for the current version:

airports/origin-destination are enough for the simplified visual arc  
`path` is still valuable for accuracy and for the next step toward a more aircraft-tracker-style rendering

**Dave Clements** [11:15 AM]  
Oh interesting. I can add the countries if that is easier, and the country entry and exit points.

**João Victor Barbosa Carvalho** [11:21 AM]  
I was referring more to the geometry / rendering side.  
path is still useful because it gives me the actual flight trajectory, so it helps with shape, progression, and anything that moves us closer to a tracker-style view.

For the country logic specifically, though, segs is actually better, since it already gives the country traversal explicitly with country, enter, and exit, instead of me having to infer that from the raw path points.

So for country focus/filtering, segs is the better source. For flight trajectory/rendering, path is still useful.

If you prefer, I can also ignore the flight path entirely and just render a simpler airport-to-airport trajectory. That would be lighter and simpler, but less true to the actual tracked route.

**Dave Clements** [11:23 AM]  
That is up to @Silvia

Let me know if you need me to change anything in that file.