/*
	In a list with values, it can be tricky the get the "next value along", as it may not be equal to the current value + 1

	e.g. In the following:

	LIST ComboMultipliers = (one = 1), (two = 2), (five = 5), (ten = 10), (twenty = 20), (hundred = 100)

	one + 1 == two 

	but 

	two + 1 == (), because there is no list value corresponding to "3".

	The following two functions allow us to the find the next value in a list compared to the current one, returning () if the current entry is already the maximum or minimum value, respectively.

	So: 
	LIST_PREV(five) == two 
	LIST_NEXT(ten) == twenty 

	and 

	LIST_PREV(one) = ()
	LIST_NEXT(hundred) = ()

*/

=== function LIST_PREV(listValue) 
	// returns the highest value that's NOT in the range from the current to the maximum
    ~ return LIST_MAX(LIST_INVERT(LIST_RANGE(LIST_ALL(listValue),  listValue, LIST_MAX(LIST_ALL(listValue)))))

=== function LIST_NEXT(listValue) 
	// returns the lowest value that's NOT in the range from the minimum to the current
    ~ return LIST_MIN(LIST_INVERT(LIST_RANGE(LIST_ALL(listValue),  LIST_MIN(LIST_ALL(listValue)), listValue)))