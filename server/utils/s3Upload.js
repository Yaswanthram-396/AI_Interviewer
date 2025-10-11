// const aws = require('aws-sdk');
// const multer = require('multer');
// const multerS3 = require('multer-s3');

// // Configure AWS SDK v2
// aws.config.update({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   region: process.env.AWS_REGION,
// });

// const s3 = new aws.S3();

// const fileFilter = (req, file, cb) => {
//   if (
//     file.mimetype === 'image/jpeg' ||
//     file.mimetype === 'image/png' ||
//     file.mimetype === 'application/pdf'
//   ) {
//     cb(null, true);
//   } else {
//     cb(new Error('Invalid file type, only JPEG, PNG, and PDF is allowed!'), false);
//   }
// };

// const upload = multer({
//   fileFilter,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5MB file size limit
//   },
//   storage: multerS3({
//     s3: s3,
//     bucket: process.env.AWS_S3_BUCKET,
//     contentType: multerS3.AUTO_CONTENT_TYPE,
//     metadata: (req, file, cb) => {
//       cb(null, { fieldName: file.fieldname });
//     },
//     key: (req, file, cb) => {
//       // Get the folder ID from request body or params
//       const folderId = req.body.folderId || req.params.folderId;
//       if (!folderId) {
//         return cb(new Error('Folder ID is required'));
//       }

//       // Create file path with folder structure
//       const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
//       const filePath = `${folderId}/${fileName}`;

//       cb(null, filePath);
//     },
//   }),
// });

// module.exports = upload;

const aws = require("aws-sdk");
const multer = require("multer");
const multerS3 = require("multer-s3");

// Configure AWS SDK v2
aws.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new aws.S3();

const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "image/jpeg" ||
    file.mimetype === "image/png" ||
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(
      new Error("Invalid file type, only JPEG, PNG, and PDF is allowed!"),
      false
    );
  }
};

const upload = multer({
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      // Get the folder ID from request body or params
      const folderId = req.body.folderId || req.params.folderId;
      if (!folderId) {
        return cb(new Error("Folder ID is required"));
      }

      // Use the original filename from the frontend (e.g., EJ-CERT-2025-aeb79329.pdf)
      const fileName = file.originalname.replace(/\s+/g, "-");
      const filePath = `${folderId}/${fileName}`;

      cb(null, filePath);
    },
  }),
});

module.exports = upload;
