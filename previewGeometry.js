// A trapezoid from the icon's facing edge to the popup's facing edge.
// Unlike a bounding rectangle, it doesn't keep a popup open while the
// pointer travels sideways along unrelated dock icons. Pure for testing.
export function inTravelCorridor(point, icon, popup, side, padding = 12) {
    const vertical = side === 'left' || side === 'right';
    const forward = side === 'top' || side === 'left';
    const axis = vertical ? 'x' : 'y';
    const cross = vertical ? 'y' : 'x';
    const length = vertical ? 'width' : 'height';
    const breadth = vertical ? 'height' : 'width';
    const start = icon[axis] + (forward ? icon[length] : 0);
    const end = popup[axis] + (forward ? 0 : popup[length]);
    const distance = (end - start) * (forward ? 1 : -1);
    if (distance <= 0)
        return false;
    const progress = (point[axis] - start) / (end - start);
    if (progress < 0 || progress > 1)
        return false;
    const low = icon[cross] + (popup[cross] - icon[cross]) * progress - padding;
    const high = icon[cross] + icon[breadth] +
        (popup[cross] + popup[breadth] - icon[cross] - icon[breadth]) * progress + padding;
    return point[cross] >= low && point[cross] <= high;
}
