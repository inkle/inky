/* "Storylet" implementation. 

    Based on https://github.com/smwhr/ink-storylets/tree/main by smwhr. 
    
    This allows you to create content as "storylets" - little chunks / scenes, which are gated by preconditions. The game offers a choice of which one the player can look at, by picking the top N that are available now. 
    
    The machinery is fairly light, and the data is kept "with" the story content, so its easy to use as an extendable template. 
    
*/



The beginning!

- (opts)
    // pick top 2 stories to choose from  
    <- listAvailableStorylets(2, -> opts) 
                    
    // provide a fallback if there's nothing available
    * ->            

-   There was nothing else to do. 
    -> END

// The following functions run through the storylet database
// and find acceptable storylets, in priority order

VAR AvailableStorylets = ()

== listAvailableStorylets(max, -> backTo)
    ~ AvailableStorylets = ()
    ~ computeStorylets(LIST_ALL(Storylets), max)
    -> offerStorylets(AvailableStorylets, backTo)
 
== function computeStorylets(list, max)
    ~ temp current = LIST_MIN(list)
    { current && max > 0:
        ~ list -= current 
        ~ temp storyletFunction = StoryletDatabase(current)
    
        { storyletFunction(Condition): 
            ~ AvailableStorylets += current
            ~ max-- 
        }
        ~ computeStorylets(list, max)
    }

=== offerStorylets(list, -> backTo)===
    ~ temp current = LIST_MIN(list)  // in ascending storylet order
    {current:
        ~ list -= current
        ~ temp storyletFunction = StoryletDatabase(current)
        
        +   [{storyletFunction(ChoiceText)}]
            ~ temp whereTo = storyletFunction(Content) 
            -> whereTo -> backTo
    } 
    { list:
        -> offerStorylets(list, backTo)
    }
    -> DONE
    

// The database, linking storylet LIST values to their index functions

LIST Props = Content, Condition, ChoiceText

LIST Storylets = StoryA, StoryB, StoryC         // in priority order

=== function StoryletDatabase(storylet)
   { storylet:
   -  StoryA:   ~ return -> StoryletData_Avocado
   -  StoryB:   ~ return -> StoryletData_Bananas
   -  StoryC:   ~ return -> StoryletData_Crumpets
   }
  
// Story Content: each storylet is a database function / content pair.

=== function StoryletData_Avocado(prop) 
    { prop: 
    -   ChoiceText: Visit the Avocado Witch
    -   Condition:  ~ return not witch_content  // once only
    -   Content:    ~ return -> witch_content
    }
    
=== witch_content
    You visit the witch. 
    ->-> 



=== function StoryletData_Bananas(prop) 
    { prop: 
    -   ChoiceText:  Now you have met the King, visit the Banana Boy!
    -   Condition:  ~ return not boy_content && king_content // once only
    -   Content:    ~ return -> boy_content
    }
    
=== boy_content
    You visit the boy.
    ->-> 
    

=== function StoryletData_Crumpets(prop) 
    { prop: 
    -   ChoiceText: Visit the Crumpet King
    -   Condition:  ~ return not king_content  // once only
    -   Content:    ~ return -> king_content
    }
    
=== king_content
    You visit the king. 
    ->->
