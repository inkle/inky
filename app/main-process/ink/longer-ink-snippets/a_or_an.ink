/*
    Prints the correct form of the indefinite article before a noun.

    Usage: 

    VAR firstAnimal = "cat"
    VAR secondAnimal = "elephant"
    VAR thirdAnimal = "elongated badger"
    I put {a(firstAnimal)} and {a(secondAnimal)} into {a("{~old|nice} box")} with {a(thirdAnimal)}.



*/


=== function a(x)
    ~ temp stringWithStartMarker = "^" + x
    { stringWithStartMarker ? "^a" or stringWithStartMarker ? "^A" or stringWithStartMarker ? "^e" or  stringWithStartMarker ? "^E"  or stringWithStartMarker ? "^i" or stringWithStartMarker ? "^I"  or stringWithStartMarker ? "^o" or stringWithStartMarker ? "^O" or stringWithStartMarker ? "^u"  or stringWithStartMarker ? "^U"  :
            an {x}
            
    // this could be extended to check for "^hi" if you wanted "an historic..."            
    - else:
        a {x}
    }