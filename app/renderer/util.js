Array.prototype.remove = function(item) {
    var idx = this.indexOf(item);
    if( idx != -1 )
        this.splice(idx, 1);
    return this;
}

Array.prototype.contains = function(item) {
    return this.indexOf(item) != -1;
}