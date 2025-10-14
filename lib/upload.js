const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('./cloudinary');

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'comp4921_project1_uploads',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const ok = /image\/(png|jpe?g|gif|webp)$/i.test(file.mimetype);
        if (!ok) return cb(new Error('Only image files are allowed'));
        cb(null, true);
    },
});

module.exports = { upload };