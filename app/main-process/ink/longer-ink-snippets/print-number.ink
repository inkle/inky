/*
    Converts an integer between -1,000,000,000 and 1,000,000,000 into its printed equivalent.

    Usage: 

    There are {print_number(RANDOM(100000,10000000))} stars in the sky.

*/

=== function print_number(x) 
{
    - x >= 1000000:
        ~ temp k = x mod 1000000
        {print_num((x - k) / 1000000)} million{ k > 0:{k < 100: and|{x mod 100 != 0:<>,}} {print_num(k)}}
    - x >= 1000:
        ~ temp y = x mod 1000
        {print_num((x - y) / 1000)} thousand{ y > 0:{y < 100: and|{x mod 100 != 0:<>,}} {print_num(y)}}
    - x >= 100:
        ~ temp z = x mod 100
        {print_num((x - z) / 100)} hundred {z > 0:and {print_num(z)}}
    - x == 0:
        zero
    - x < 0: 
        minus {print_num(-1 * x)}
    - else:
        { x >= 20:
            { x / 10:
                - 2: twenty
                - 3: thirty
                - 4: forty
                - 5: fifty
                - 6: sixty
                - 7: seventy
                - 8: eighty
                - 9: ninety
            }
            { x mod 10 > 0:
                <>-<>
            }
        }
        { x < 10 || x > 20:
            { x mod 10:
                - 1: one
                - 2: two
                - 3: three
                - 4: four
                - 5: five
                - 6: six
                - 7: seven
                - 8: eight
                - 9: nine
            }
        - else:
            { x:
                - 10: ten
                - 11: eleven
                - 12: twelve
                - 13: thirteen
                - 14: fourteen
                - 15: fifteen
                - 16: sixteen
                - 17: seventeen
                - 18: eighteen
                - 19: nineteen
            }
        }
} 
