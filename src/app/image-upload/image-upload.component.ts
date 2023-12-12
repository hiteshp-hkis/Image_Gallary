import { Component, ElementRef, ViewChild } from '@angular/core';
import { S3 } from 'aws-sdk';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, NgForm } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import * as firebase from "firebase/app";
import { getDatabase, limitToLast, onValue, query, ref, } from "firebase/database";
import { InfiniteScrollModule } from 'ngx-infinite-scroll';
import { provideAnimations } from '@angular/platform-browser/animations';
import { NgxMasonryComponent, NgxMasonryModule, NgxMasonryOptions } from 'ngx-masonry';
import { environment } from '../../environments/environment';

declare var jQuery: any;

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HttpClientModule, InfiniteScrollModule, NgxMasonryModule],
  providers: [provideAnimations()],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.css'
})

export class ImageUploadComponent {

  // Configuration options for the NgxMasonry component
  public masonryOptions: NgxMasonryOptions = {
    gutter: 10,  // Specifies the space between items in pixels
    itemSelector: ".masonry-item", // Selector for masonry items
    columnWidth: ".masonry-item", // Selector for the column width
    horizontalOrder: true, // Controls the horizontal order of layout
    percentPosition: true, // Positions items using percentages rather than pixels
    animations: {}, // Object for custom animations (empty object in this case)
    resize: true, // Allows resizing of items
  };

  // ViewChild: Reference to the 'hashtagsInput' element in the template
  @ViewChild('hashtagsInput') hashtagsInput!: ElementRef;

  // ViewChild: Reference to the NgxMasonryComponent instance in the template
  @ViewChild(NgxMasonryComponent)
  public masonry!: NgxMasonryComponent;

  private selectedFiles: any = '';  // Variable to store selected files
  public imageSrc: string = ''; // Variable to store the image source
  public progress: any = ""; // Variable to store progress information
  public tagArray: string[] = []; // Array to store tags
  public currentTag: string = ''; // Variable to store the current tag

  // Flags to track tag, title, path, save, upload, image type and record errors
  public isTagError: boolean = false;
  public isTitleError: boolean = false;
  public isPathError: boolean = false;
  public isSaveError: boolean = false;
  public isUploadError: boolean = false;
  public isImageTypeError: boolean = false;
  public isRecord: boolean = false;

  // Flag to indicate whether a loader is currently active
  public isLoader: boolean = false;

  // Variables for managing the application, image list, pagination, form group, gallery list, loading status, and records
  private app: any; // Reference to the application
  public imageList: any; // List of images
  public pageNumber: number = 0; // Current page number for pagination
  public imageListObject: any; // Object containing image list information
  public GalleryImage: FormGroup; // Form group for gallery images
  public galleryList: any; // List of gallery items
  public loadingConversations: any; // Loading status for conversations
  public totalConvPageCount: any; // Total page count for conversations
  public currentConvPageNumber: any; // Current page number for conversations
  public timeout: any = null; // Timeout variable for delayed actions

  constructor(private formBuilder: FormBuilder,
    private httpclient: HttpClient,) {
    this.GalleryImage = this.formBuilder.group({
      'title': ['', [Validators.required]],
      'tag': [''],
      'path': ['', [Validators.required]],
      'date': ['']
    });
  }

  // Lifecycle hook: ngOnInit - Called when the component is initialized
  async ngOnInit() {
    this.isLoader = true;
    this.app = firebase.initializeApp(environment.firebaseConfig);
    var db1 = getDatabase(this.app);
    this.pageNumber++;
    const starCountRef = query(ref(db1, 'Gallery'), limitToLast(this.pageNumber * 10));
    onValue(starCountRef, (snapshot) => {
      this.isLoader = false;
      this.imageListObject = snapshot.val();
      this.imageList = Object.values(this.imageListObject).reverse();
      this.galleryList = Object.values(this.imageListObject).reverse();
    });
  }

  // Event handler: ngSubmit - Called when a form is submitted
  async ngSubmit() {
    if (this.GalleryImage.controls['path'].value == null || this.GalleryImage.controls['path'].value == "") {
      this.isPathError = true;
    }
    if (this.imageSrc == null || this.imageSrc == "") {
      this.isPathError = true;
    }
    else {
      this.isPathError = false;
      await this.upload();
    }
    if (this.GalleryImage.controls['title'].value == null || this.GalleryImage.controls['title'].value == "") {
      this.isTitleError = true;
    }
  }

  // Event handler: onScroll - Called when a scrolling event occurs
  public onScroll() {
    this.pageNumber++;
    this.app = firebase.initializeApp(environment.firebaseConfig);
    var db1 = getDatabase(this.app);
    const starCountRef = query(ref(db1, 'Gallery'), limitToLast(this.pageNumber * 10));
    onValue(starCountRef, (snapshot) => {
      debugger
      this.imageListObject = snapshot.val();
      var newImageList = Object.values(this.imageListObject).reverse();
      var newList: any[] = [];
      newImageList.forEach((value: any) => {
        if (this.galleryList.find((x: any) => x.path == value.path) == undefined) {
          newList.push(value);
        }
      });
      this.imageList = [...this.imageList, ...newList]
      this.imageList = this.imageList.filter(function (itm: any, i: any, a: string | any[]) {
        return i == a.indexOf(itm);
      });

      this.galleryList = Object.values(this.imageListObject);
      this.masonry.layout();
    });
  }

  // Function: addHashtag - Adds a hashtag to the tagArray
  public addHashtag() {
    const hashtagValue = this.currentTag.trim();
    if (hashtagValue.length > 0) {
      if (!this.tagArray.includes(hashtagValue)) {
        this.tagArray.push(hashtagValue);
        this.currentTag = '';
        this.isTagError = false;
      }
      else {
        this.isTagError = true;
      }
    }
  }

  // Function: removeHashtag - Removes a hashtag from the tagArray
  public removeHashtag(hashtag: string) {
    const index = this.tagArray.indexOf(hashtag);
    if (index !== -1) {
      this.tagArray.splice(index, 1);
    }
  }

  // Function: upload - Handles the asynchronous upload process to AWS S3 bucket
  public async upload() {
    this.progress = "0%";  // Set initial progress to 0%

    // Extract file information
    const file = this.selectedFiles;
    const contentType = file.type;

    // Create an AWS S3 bucket instance with environment credentials
    const bucket = new S3({
      accessKeyId: environment.accessKeyId,
      secretAccessKey: environment.secretAccessKey,
      region: environment.region
    });

    // Define parameters for the S3 upload
    const params = {
      Bucket: environment.bucketName,
      Key: environment.folderName + file.name,
      Body: file,
      ACL: 'public-read',
      ContentType: contentType
    };

    // Perform the S3 upload and track progress
    await bucket.upload(params).on('httpUploadProgress', (evt) => {
      // Calculate and update upload progress
      const percent = Math.round(
        (100 * evt.loaded) / evt.total
      );
      this.progress = percent;

      // Update progress message when upload is completed
      if (this.progress === 100) {
        this.progress = this.progress + "%";
        setTimeout(() => {
          this.progress = "Completed...";
        }, 0);
      } else {
        this.progress = this.progress + "%";
      }
    }).send((err: any, data: any) => {
      // Handle the response from the S3 upload
      if (data) {
        // Set the path in the form control and submit the image
        this.GalleryImage.controls['path'].setValue(data.Location);
        this.imageSubmit();
        return true;
      }
      else {
        // Handle upload error
        this.isUploadError = true;
        return false;
      }
    });
  }

  // Function: openAddModal - Resets form, clears variables, and resets error flags for adding a new image in the modal
  public openAddModal() {
    // Reset the GalleryImage form
    this.GalleryImage.reset();

    // Clear the image source and tagArray
    this.imageSrc = '';
    this.tagArray = [];
    this.progress = "";

    // Reset error flags for title, path, tags, image type, save, and upload errors
    this.isTitleError = false;
    this.isPathError = false;
    this.isTagError = false;
    this.isImageTypeError = false;
    this.isSaveError = false;
    this.isUploadError = false;
  }

  // Function: closeModal - Resets form, clears variables, and resets title error flag for closing the modal
  public closeModal() {
    this.GalleryImage.reset();
    this.imageSrc = '';
    this.tagArray = [];
    this.isTitleError = false;
  }

  // Function: removeImage - Clears the image source to remove the displayed image
  removeImage() {
    this.imageSrc = '';
  }

  // Function: searchFilter - Handles filtering of images based on search input
  public searchFilter(event: any) {
    this.isLoader = true;
    // Clear existing timeout to prevent rapid consecutive searches
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
    }

    // Set a timeout to delay the search execution for better user experience
    this.timeout = setTimeout(() => {
      // Check if the search input is valid and meets the minimum length requirement
      if (event.target.value != "" && event.target.value != null && event.target.value.length >= 3) {
        // Initialize Firebase app and set up a connection to the database
        this.app = firebase.initializeApp(environment.firebaseConfig);
        var db1 = getDatabase(this.app);

        // Create a query for retrieving data from the 'Gallery' node in the database
        const starCountRef = query(ref(db1, 'Gallery'));

        // Listen for changes in the database and filter the image list accordingly
        onValue(starCountRef, (snapshot) => {
          this.imageListObject = snapshot.val();

          // Check if there are no records in the database
          if (this.imageListObject == null) {
            this.isRecord = true;
            this.isLoader = false;
          } else {
            this.isLoader = false;
            this.isRecord = false;

            // Filter the image list based on title and tag matches
            this.imageList = Object.values(this.imageListObject).filter((item: any) =>
              item.title.toLowerCase().includes(event.target.value) || item.tag?.some((tag: any) =>
                tag.toLowerCase().includes(event.target.value)
              )
            );

            // Update Masonry layout after filtering
            this.masonry?.layout();
          }

        });
      } else {
        this.isLoader = false;
        this.isRecord = false;
        this.imageList = this.galleryList;
      }
    }, 2000); // Set a delay of 3000 milliseconds (3 seconds) before executing the search
  }

  // Function: selectFile - Handles the selection of a file and validates its size and type
  public selectFile(event: any) {
    let reader = new FileReader();
    let file = event.target.files[0];

    // Check if the file size is within the allowed limit (20 MB)
    if (file.size <= 20000000) {
      this.isUploadError = false;

      // Check if the file type is an allowed image format (jpg, jpeg, png)
      if (file.type == "image/jpg" || file.type == "image/jpeg" || file.type == "image/png") {
        this.isImageTypeError = false;

        // Check if there are files in the event and start reading the file
        if (event.target.files && event.target.files.length) {
          this.isPathError = false;
          reader.readAsDataURL(file);
          reader.onload = () => {
            this.selectedFiles = file;
            this.imageSrc = reader.result as string;
          }
        }
      } else {
        // Set image type error flag if the file type is not allowed
        this.isImageTypeError = true;
      }
    }
    else {
      // Set upload error flag if the file size exceeds the limit
      this.isUploadError = true;
    }
  }

  // Function: imageSubmit - Submits the image data to the Firebase Realtime Database
  public imageSubmit() {
    // Set the 'tag' control in the GalleryImage form to the tagArray
    this.GalleryImage.controls['tag'].setValue(this.tagArray);

    // Set the 'date' control in the GalleryImage form to the current timestamp
    this.GalleryImage.controls['date'].setValue(new Date().getTime());

    // Check if the form is valid
    if (this.GalleryImage.valid) {
      this.httpclient.post(environment.firebaseApi,
        this.GalleryImage.value
      ).subscribe(response => {
        // Reset the form and additional controls on successful submission
        this.GalleryImage.reset();
        this.GalleryImage.controls['tag'].setValue('');
        jQuery(".btn-close").click(); // Close the modal using jQuery
      },
        (error) => {
          // Set the save error flag if there is an error during the POST request
          this.isSaveError = true;
        });
    }
  }
}
