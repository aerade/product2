"""Crop real browser captures for slide legibility. No content is changed."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
folder=root/'docs/screenshots'
for name,height in [('catalog',970),('search',850),('library',850),('lecture',850)]:
    image=Image.open(folder/(name+'.jpg'))
    image.crop((0,0,image.width,min(height,image.height))).save(folder/(name+'-top.jpg'),quality=94)
image=Image.open(folder/'lecture.jpg')
image.crop((1012,855,1406,min(1475,image.height))).save(folder/'answer-detail.jpg',quality=94)
