from PIL import Image

class Img_HandlerException(Exception):
    def __init__(self, message, error_code = None):
        super().__init__(message)
        self.error_code = error_code

class Img_Handler:
    def __init__(self):
        pass

    def get_img(self, img_path:str) -> Image:
        return Image.open(img_path)
    
    def store_img(self, img: Image, img_path:str) -> None:
        # try to optimize JPEG saves (smaller files, faster IO) while preserving quality
        ext = img_path.lower().split('.')[-1]
        save_kwargs = {}
        if ext in ['jpg', 'jpeg']:
            save_kwargs = {'optimize': True, 'quality': 85}
        img.save(img_path, **save_kwargs)
