/*  

    A system for assigning, reading and altering integer values to list items. 

    This means you can assign variable runtimes scores to things, such as a quantity to an inventory item, or a value to a player statistic.
    
*/


LIST Wallet = Coins, Notes, Cards 

~ _setValueOfState(Coins, 3) // the player has 3 coins 
~ _setValueOfState(Cards, 2) // the player has 2 cards

I have {_getValueOfState(Coins)} coins and {_getValueOfState(Cards)} cards right now. 

~ _alterValueForState(Coins, 10)

Now I have {_getValueOfState(Coins)}.

~ _alterValueForState(Cards, 30)
~ _alterValueForState(Cards, -60)

Now I have {_getValueOfState(Cards)}. Yikes!

-> END


  
// 1) Storage space  
VAR StatesNegative = () // record which states are currently holding negative values
VAR StatesBinary1 = ()
VAR StatesBinary2 = ()
VAR StatesBinary4 = ()
VAR StatesBinary8 = ()
VAR StatesBinary16 = ()
VAR StatesBinary32 = ()
VAR StatesBinary64 = ()
VAR StatesBinary128 = ()
VAR StatesBinary256 = ()
VAR StatesBinary512 = ()
VAR StatesBinary1024 = ()
VAR StatesBinary2048 = ()   // storage up to 4095, but you can keep going by adding more states
// --> ADDITIONAL STORAGE GOES HERE

CONST MAX_BINARY_BIT = 2048

VAR StatesInStorage = ()

  
// 2) Get value for state being set

    
=== function _getValueOfState(id) // always single 
    // do this the dumb long way rather than a fancy loop
    ~ temp value = 0 
    ~ value += (StatesBinary1 ? id) * 1
    ~ value += (StatesBinary2 ? id) * 2
    ~ value += (StatesBinary4 ? id) * 4
    ~ value += (StatesBinary8 ? id) * 8
    ~ value += (StatesBinary16 ? id) * 16
    ~ value += (StatesBinary32 ? id) * 32
    ~ value += (StatesBinary64 ? id) * 64
    ~ value += (StatesBinary128 ? id) * 128
    ~ value += (StatesBinary256 ? id) * 256
    ~ value += (StatesBinary512 ? id) * 512
    ~ value += (StatesBinary1024 ? id) * 1024
    ~ value += (StatesBinary2048 ? id) * 2048
// --> ADDITIONAL STORAGE GOES HERE
    { StatesNegative ? id: 
            ~ value = value * -1
    }
    ~ return value 
    

// 3) Set value for state being set   
    
=== function _setValueOfState(state, value) // always single 
    { value >= 2 * MAX_BINARY_BIT || value <= -2 * MAX_BINARY_BIT: 
        [ ERROR - trying to store a value of {value} for {state}, which is outside of the space provided. Please increase {MAX_BINARY_BIT}, and supply additional storage values. ]
    }
    ~ temp currentValue = _getValueOfState(state)
    { currentValue != 0 && currentValue != value:
         ~ _removeValuesForState(state)
    }
    { value != 0:
        ~ StatesInStorage += state
        { value < 0: 
            ~ StatesNegative += state 
            ~ value = -1 * value         // store the value as a positive 
        - else: 
            ~ StatesNegative -= state 
        }
        ~ _setBinaryValuesForState(state, value, MAX_BINARY_BIT )
    }
    // uncomment the following for test logging
    // [ {value} - set value for {state} to {getValueOfState(state) } ]


=== function _setBinaryValuesForState(id, value, binaryValue)
    { value >= binaryValue:
        ~ value -= binaryValue
        {binaryValue: 
        -  1:   ~ StatesBinary1 += id
        -  2:   ~ StatesBinary2 += id
        -  4:   ~ StatesBinary4 += id
        -  8:   ~ StatesBinary8 += id
        -  16:   ~ StatesBinary16 += id
        -  32:   ~ StatesBinary32 += id
        -  64:   ~ StatesBinary64 += id
        -  128:   ~ StatesBinary128 += id
        -  256:   ~ StatesBinary256 += id
        -  512:   ~ StatesBinary512 += id
        -  1024:   ~ StatesBinary1024 += id
        -  2048:   ~ StatesBinary2048 += id
        }
// --> ADDITIONAL STORAGE LINES GO HERE
    }
    { binaryValue > 1: 
        ~ _setBinaryValuesForState(id, value, binaryValue / 2)
    }


// 3) Removal

=== function _removeValuesForState(state)
    ~ StatesInStorage -= state
    ~ StatesNegative -= state
    ~ StatesBinary1 -= state
    ~ StatesBinary2 -= state
    ~ StatesBinary4 -= state
    ~ StatesBinary8 -= state
    ~ StatesBinary16 -= state
    ~ StatesBinary32 -= state
    ~ StatesBinary64 -= state
    ~ StatesBinary128 -= state
    ~ StatesBinary256 -= state
    ~ StatesBinary512 -= state
    ~ StatesBinary1024 -= state
    ~ StatesBinary2048 -= state

// 4) alter the value for a state

=== function _alterValueForState(state, delta)
    ~ _setValueOfState(state, _getValueOfState(state) + delta)
    