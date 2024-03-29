

/**

 * @file A simple WebGL example for viewing meshes read from OBJ files

 * @author Eric Shaffer <shaffer1@illinois.edu>

 */



/** @global The WebGL context */

var gl;



/** @global The HTML5 canvas we draw on */

var canvas;



/** @global A simple GLSL shader program */

var shaderProgram;

var skyboxShaderProgram;

var reflectionShaderProgram;
var refractionShaderProgram;
var phongShaderProgram;



/** @global The Modelview matrix */

var mvMatrix = mat4.create();

var lightPositionUpdate = vec3.create();




/** @global The View matrix */

var vMatrix = mat4.create();


var yRotationMatrix = mat4.create();
var yInverseRotationMatrix = mat4.create();




/** @global The Projection matrix */

var pMatrix = mat4.create();

var pvInverseMatrix = mat4.create();



/** @global The Normal matrix */

var nMatrix = mat3.create();



/** @global The matrix stack for hierarchical modeling */

var mvMatrixStack = [];



/** @global An object holding the geometry for a 3D mesh */

var myMesh;





// View parameters

/** @global Location of the camera in world coordinates */

var eyePt = vec3.fromValues(0.0,1.0,10.0);

/** @global Direction of the view in world coordinates */

var viewDir = vec3.fromValues(0.0,0.0,-1.0);

/** @global Up vector for view matrix creation, in world coordinates */

var up = vec3.fromValues(0.0,1.0,0.0);

/** @global Location of a point along viewDir in world coordinates */

var viewPt = vec3.fromValues(0.0,0.0,0.0);



//Light parameters

/** @global Light position in VIEW coordinates */

var lightPosition = [5,5,5];

/** @global Ambient light color/intensity for Phong reflection */

var lAmbient = [0.1,0.1,0.1];

/** @global Diffuse light color/intensity for Phong reflection */

var lDiffuse = [0.7,0.7,0.7];

/** @global Specular light color/intensity for Phong reflection */

var lSpecular =[0,0,0];



//Material parameters

/** @global Ambient material color/intensity for Phong reflection */

var kAmbient = [205.0/255.0,163.0/255.0,63.0/255.0];

/** @global Diffuse material color/intensity for Phong reflection */

var kTerrainDiffuse = [205.0/255.0,163.0/255.0,63.0/255.0];

/** @global Specular material color/intensity for Phong reflection */

var kSpecular = [1.0,1.0,1.0];

/** @global Shininess exponent for Phong reflection */

var shininess = 300;

/** @global Edge color fpr wireframeish rendering */

var kEdgeBlack = [0.0,0.0,0.0];

/** @global Edge color for wireframe rendering */

var kEdgeWhite = [1.0,1.0,1.0];

var uTextureCube;





//Model parameters

var eulerY=0;

var worldRotation = 0;

var worldRotationSpeed = 0.1;



//-------------------------------------------------------------------------

/**

 * Asynchronously read a server-side text file

 */

function asyncGetFile(url) {

  console.log("Getting text file");

  return new Promise((resolve, reject) => {

    const xhr = new XMLHttpRequest();

    xhr.open("GET", url);

    xhr.onload = () => resolve(xhr.responseText);

    xhr.onerror = () => reject(xhr.statusText);

    xhr.send();

    console.log("Made promise");

  });

}



//-------------------------------------------------------------------------

/**

 * Sends Modelview matrix to shader

 */

function uploadModelViewMatrixToShader() {


  gl.uniformMatrix4fv(shaderProgram.vMatrixUniform, false, vMatrix);

  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);

  gl.uniformMatrix4fv(shaderProgram.yRotationMatrixUniform, false, yRotationMatrix);

  mat4.invert(yInverseRotationMatrix,yRotationMatrix);

  gl.uniformMatrix4fv(shaderProgram.yInverseRotationMatrixUniform, false,yInverseRotationMatrix);


  gl.uniformMatrix4fv(shaderProgram.pvInverseMatrixUniform, false, pvInverseMatrix);


}



//-------------------------------------------------------------------------

/**

 * Sends projection matrix to shader

 */

function uploadProjectionMatrixToShader() {

  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform,

                      false, pMatrix);



}



//-------------------------------------------------------------------------

/**

 * Generates and sends the normal matrix to the shader

 */

function uploadNormalMatrixToShader() {

  mat3.fromMat4(nMatrix,mvMatrix);

  mat3.transpose(nMatrix,nMatrix);

  mat3.invert(nMatrix,nMatrix);

  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);

}



//----------------------------------------------------------------------------------

/**

 * Pushes matrix onto modelview matrix stack

 */

function mvPushMatrix() {

    var copy = mat4.clone(mvMatrix);

    mvMatrixStack.push(copy);

}





//----------------------------------------------------------------------------------

/**

 * Pops matrix off of modelview matrix stack

 */

function mvPopMatrix() {

    if (mvMatrixStack.length == 0) {

      throw "Invalid popMatrix!";

    }

    mvMatrix = mvMatrixStack.pop();

}



//----------------------------------------------------------------------------------

/**

 * Sends projection/modelview matrices to shader

 */

function setMatrixUniforms() {

    uploadModelViewMatrixToShader();

    uploadNormalMatrixToShader();

    uploadProjectionMatrixToShader();

}



//----------------------------------------------------------------------------------

/**

 * Translates degrees to radians

 * @param {Number} degrees Degree input to function

 * @return {Number} The radians that correspond to the degree input

 */

function degToRad(degrees) {

        return degrees * Math.PI / 180;

}



//----------------------------------------------------------------------------------

/**

 * Creates a context for WebGL

 * @param {element} canvas WebGL canvas

 * @return {Object} WebGL context

 */

function createGLContext(canvas) {

  var names = ["webgl", "experimental-webgl"];

  var context = null;

  for (var i=0; i < names.length; i++) {

    try {

      context = canvas.getContext(names[i]);

    } catch(e) {}

    if (context) {

      break;

    }

  }

  if (context) {

    context.viewportWidth = canvas.width;

    context.viewportHeight = canvas.height;

  } else {

    alert("Failed to create WebGL context!");

  }

  return context;

}



//----------------------------------------------------------------------------------

/**

 * Loads Shaders

 * @param {string} id ID string for shader to load. Either vertex shader/fragment shader

 */

function loadShaderFromDOM(id) {

  var shaderScript = document.getElementById(id);



  // If we don't find an element with the specified id

  // we do an early exit

  if (!shaderScript) {

    return null;

  }



  // Loop through the children for the found DOM element and

  // build up the shader source code as a string

  var shaderSource = "";

  var currentChild = shaderScript.firstChild;

  while (currentChild) {

    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE

      shaderSource += currentChild.textContent;

    }

    currentChild = currentChild.nextSibling;

  }



  var shader;

  if (shaderScript.type == "x-shader/x-fragment") {

    shader = gl.createShader(gl.FRAGMENT_SHADER);

  } else if (shaderScript.type == "x-shader/x-vertex") {

    shader = gl.createShader(gl.VERTEX_SHADER);

  } else {

    return null;

  }



  gl.shaderSource(shader, shaderSource);

  gl.compileShader(shader);



  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

    alert(gl.getShaderInfoLog(shader));

    return null;

  }

  return shader;

}



//----------------------------------------------------------------------------------

/**

 * Setup the fragment and vertex shaders

 */


function setupShaderLocations(shaderProgram)
{

	shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");

  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);



  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");

  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);


  //new
  shaderProgram.textureCoords =  gl.getAttribLocation(shaderProgram, "aVertexTextureCoords");
  gl.enableVertexAttribArray(shaderProgram.textureCoords);




  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");

  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");

  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");

  shaderProgram.vMatrixUniform = gl.getUniformLocation(shaderProgram, "uVMatrix");

  shaderProgram.yRotationMatrixUniform = gl.getUniformLocation(shaderProgram, "uYRotationMatrix");

  shaderProgram.yInverseRotationMatrixUniform = gl.getUniformLocation(shaderProgram, "uYInverseRotationMatrix");





  //InverseProjectionMatrix
  shaderProgram.pvInverseMatrixUniform = gl.getUniformLocation(shaderProgram, "uPVInverseMatrix");



  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");

  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");

  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");

  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");

  shaderProgram.uniformShininessLoc = gl.getUniformLocation(shaderProgram, "uShininess");

  shaderProgram.uniformAmbientMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKAmbient");

  shaderProgram.uniformDiffuseMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKDiffuse");

  shaderProgram.uniformSpecularMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKSpecular");

  shaderProgram.cubeSamplerLoc = gl.getUniformLocation(shaderProgram,"uCubeSampler");

};


function setupShaders(outShaderProgram,vertexShaderName,fragmentShaderName) {

  //vertexShader = loadShaderFromDOM("reflection-shader-vs");

  //fragmentShader = loadShaderFromDOM("straight-shader-fs");


 vertexShader = loadShaderFromDOM(vertexShaderName);
 fragmentShader = loadShaderFromDOM(fragmentShaderName);

 console.log(fragmentShaderName);

  shaderProgram = gl.createProgram();

  gl.attachShader(shaderProgram, vertexShader);

  gl.attachShader(shaderProgram, fragmentShader);

  gl.linkProgram(shaderProgram);



  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {

    alert("Failed to setup shaders");

  }



  gl.useProgram(shaderProgram);

  uTextureCube = texture_creation(gl);



  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");

  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);



  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");

  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);


  //new
  shaderProgram.textureCoords =  gl.getAttribLocation(shaderProgram, "aVertexTextureCoords");
  gl.enableVertexAttribArray(shaderProgram.textureCoords);




  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");

  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");

  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");

  shaderProgram.vMatrixUniform = gl.getUniformLocation(shaderProgram, "uVMatrix");

  shaderProgram.yRotationMatrixUniform = gl.getUniformLocation(shaderProgram, "uYRotationMatrix");

  shaderProgram.yInverseRotationMatrixUniform = gl.getUniformLocation(shaderProgram, "uYInverseRotationMatrix");





  //InverseProjectionMatrix
  shaderProgram.pvInverseMatrixUniform = gl.getUniformLocation(shaderProgram, "uPVInverseMatrix");



  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");

  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");

  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");

  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");

  shaderProgram.uniformShininessLoc = gl.getUniformLocation(shaderProgram, "uShininess");

  shaderProgram.uniformAmbientMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKAmbient");

  shaderProgram.uniformDiffuseMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKDiffuse");

  shaderProgram.uniformSpecularMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKSpecular");

  shaderProgram.cubeSamplerLoc = gl.getUniformLocation(shaderProgram,"uCubeSampler");

  outShaderProgram = shaderProgram;

  return shaderProgram;

}



//-------------------------------------------------------------------------

/**

 * Sends material information to the shader

 * @param {Float32} alpha shininess coefficient

 * @param {Float32Array} a Ambient material color

 * @param {Float32Array} d Diffuse material color

 * @param {Float32Array} s Specular material color

 */

function setMaterialUniforms(alpha,a,d,s) {

  gl.uniform1f(shaderProgram.uniformShininessLoc, alpha);

  gl.uniform3fv(shaderProgram.uniformAmbientMaterialColorLoc, a);

  gl.uniform3fv(shaderProgram.uniformDiffuseMaterialColorLoc, d);

  gl.uniform3fv(shaderProgram.uniformSpecularMaterialColorLoc, s);

}



//-------------------------------------------------------------------------

/**

 * Sends light information to the shader

 * @param {Float32Array} loc Location of light source

 * @param {Float32Array} a Ambient light strength

 * @param {Float32Array} d Diffuse light strength

 * @param {Float32Array} s Specular light strength

 */

function setLightUniforms(loc,a,d,s) {


  gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);

  gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);

  gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);

  gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);

}



//----------------------------------------------------------------------------------

/**

 * Populate buffers with data

 */

function setupMesh(filename) {

  cube =  new CubeMesh();

  skybox = new skybox();



  myMesh = new TriMesh();

  myPromise = asyncGetFile(filename);



  myPromise.then((retrievedText) => {

    myMesh.loadFromOBJ(retrievedText);

    console.log("Yay! got the file");

  })

  .catch(

    (reason) => {

      console.log(`Handle rejected promise (${reason}) here.`);

  })

}



//----------------------------------------------------------------------------------

/**

 * Draw call that applies matrix transformations to model and draws model in frame

 */

function draw() {

    //console.log("function draw()")



    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);



    // We'll use perspective

    mat4.perspective(pMatrix,degToRad(45),

                     gl.viewportWidth / gl.viewportHeight,

                     0.1, 500.0);



    // We want to look down -z, so create a lookat point in that direction

    //vec3.add(viewPt, eyePt, viewDir);

    vec3.fromValues(viewPt,0,0,0);

    // Then generate the lookat matrix and initialize the view matrix to that view

    mat4.lookAt(vMatrix,eyePt,viewPt,up);

    var invertedViewMatrix = mat4.create();

    mat4.invert(invertedViewMatrix,vMatrix);

    invertedViewMatrix[12] = 0;
    invertedViewMatrix[13] = 0;
    invertedViewMatrix[14] = 0;


    mat4.multiply(pvInverseMatrix,pMatrix, vMatrix);
	mat4.invert(pvInverseMatrix,pvInverseMatrix);


    //Draw Mesh

    //ADD an if statement to prevent early drawing of myMesh

    if (myMesh.loaded()) {

        mvPushMatrix();


        mat4.fromRotation(yRotationMatrix, worldRotation, vec3.fromValues(0,-1,0));

        mat4.rotateY(mvMatrix, mvMatrix, degToRad(eulerY));

        mat4.multiply(mvMatrix,vMatrix,mvMatrix);

        setMatrixUniforms();


		mat4.fromRotation(yInverseRotationMatrix, worldRotation, vec3.fromValues(0,1,0));


        //vec3.rotateY(lightPositionUpdate,lightPosition,vec3.fromValues(0,0,0),worldRotation);



        //console.log([lightPositionUpdate[0],lightPositionUpdate[2]]);

        setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);



        if (document.getElementById("polygon").checked)

        {

        	


            //no cow this time

            shaderProgram = reflectionShaderProgram;

            gl.useProgram(reflectionShaderProgram);

            setupShaderLocations(reflectionShaderProgram);


            setMatrixUniforms();


        	setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);


            setMaterialUniforms(shininess,kAmbient,

                                kTerrainDiffuse,kSpecular);


            myMesh.drawTriangles();


            shaderProgram = skyboxShaderProgram;


            gl.useProgram(skyboxShaderProgram);

            setupShaderLocations(skyboxShaderProgram);


            setMatrixUniforms();

        	setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);


            setMaterialUniforms(shininess,kAmbient,

                                kTerrainDiffuse,kSpecular);

            cube.drawTriangles();

            //skybox.drawTriangles();

        }



if (document.getElementById("wirepoly").checked)

        {

        	


            //no cow this time

            shaderProgram = refractionShaderProgram;

            gl.useProgram(refractionShaderProgram);

            setupShaderLocations(refractionShaderProgram);


            setMatrixUniforms();

        	setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);


            setMaterialUniforms(shininess,kAmbient,

                                kTerrainDiffuse,kSpecular);


            myMesh.drawTriangles();


            shaderProgram = skyboxShaderProgram;


            gl.useProgram(skyboxShaderProgram);

            setupShaderLocations(skyboxShaderProgram);


            setMatrixUniforms();

        	setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);


            setMaterialUniforms(shininess,kAmbient,

                                kTerrainDiffuse,kSpecular);

            cube.drawTriangles();

            //skybox.drawTriangles();

        }



        if(document.getElementById("wireframe").checked)

        {

            setMaterialUniforms(shininess,kAmbient,

                                kEdgeWhite,kSpecular);


            shaderProgram = phongShaderProgram;

            gl.useProgram(phongShaderProgram);

            setupShaderLocations(phongShaderProgram);


            setMatrixUniforms();

            //console.log(yInverseRotationMatrix);
            vec3.rotateY(lightPositionUpdate,lightPosition,vec3.fromValues(0,0,0),worldRotation);


        	setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);


            setMaterialUniforms(shininess,kAmbient,

                                kTerrainDiffuse,kSpecular);


            myMesh.drawTriangles();


            shaderProgram = skyboxShaderProgram;


            gl.useProgram(skyboxShaderProgram);

            setupShaderLocations(skyboxShaderProgram);


            setMatrixUniforms();

        	setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);


            setMaterialUniforms(shininess,kAmbient,

                                kTerrainDiffuse,kSpecular);

            cube.drawTriangles();

        }

        mvPopMatrix();

    }



}



//----------------------------------------------------------------------------------

//Code to handle user interaction

var currentlyPressedKeys = {};



function handleKeyDown(event) {

        //console.log("Key down ", event.key, " code ", event.code);

        currentlyPressedKeys[event.key] = true;

          if (currentlyPressedKeys["a"]) {

            // key A

            eulerY-= 1;



        } else if (currentlyPressedKeys["d"]) {

            // key D

            eulerY+= 1;

            //var lp_x = eyePt[0];
            //var lp_z = eyePt[2];

            //lightPosition[0] = Math.cos(-degToRad(1))*lp_x-Math.sin(-degToRad(1))*lp_z;
            //lightPosition[2] = Math.sin(-degToRad(1))*lp_x+Math.cos(-degToRad(1))*lp_z;


         

        }



        if (currentlyPressedKeys["ArrowUp"]){

            // Up cursor key

            event.preventDefault();

            worldRotation -= worldRotationSpeed;

            var eyePt_x = eyePt[0];
            var eyePt_z = eyePt[2];



            eyePt[0] = Math.cos(-worldRotationSpeed)*eyePt_x-Math.sin(-worldRotationSpeed)*eyePt_z;
            eyePt[2] = Math.sin(-worldRotationSpeed)*eyePt_x+Math.cos(-worldRotationSpeed)*eyePt_z;








            //eyePt[2]+= 0.01;

        } else if (currentlyPressedKeys["ArrowDown"]){

            event.preventDefault();

            // Down cursor key
            worldRotation += worldRotationSpeed;
            var eyePt_x = eyePt[0];
            var eyePt_z = eyePt[2];



            eyePt[0] = Math.cos(worldRotationSpeed)*eyePt_x-Math.sin(worldRotationSpeed)*eyePt_z;
            eyePt[2] = Math.sin(worldRotationSpeed)*eyePt_x+Math.cos(worldRotationSpeed)*eyePt_z;

            //eyePt[2]-= 0.01;

        }



}



function handleKeyUp(event) {

        //console.log("Key up ", event.key, " code ", event.code);

        currentlyPressedKeys[event.key] = false;

}



//----------------------------------------------------------------------------------

/**

 * Startup function called from html code to start program.

 */

 function startup() {

  canvas = document.getElementById("myGLCanvas");

  gl = createGLContext(canvas);

 // setupShaders();

  	 skyboxShaderProgram  = setupShaders(skyboxShaderProgram,"reflection-shader-vs","straight-shader-fs");

	 reflectionShaderProgram = setupShaders(skyboxShaderProgram,"reflection-shader-vs","reflection-shader-fs");
     refractionShaderProgram = setupShaders(skyboxShaderProgram,"reflection-shader-vs","refraction-shader-fs");
	 phongShaderProgram = setupShaders(skyboxShaderProgram,"shader-blinn-phong-vs","shader-blinn-phong-fs");


  setupMesh("teapot_0.obj");

  //setupMesh("teapot.obj");

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  gl.enable(gl.DEPTH_TEST);

  document.onkeydown = handleKeyDown;

  document.onkeyup = handleKeyUp;

  tick();

}





//----------------------------------------------------------------------------------

/**

  * Update any model transformations

  */

function animate() {

   //console.log(eulerX, " ", eulerY, " ", eulerZ);

   document.getElementById("eY").value=eulerY;

   document.getElementById("eZ").value=worldRotation;

}





//----------------------------------------------------------------------------------

/**

 * Keeping drawing frames....

 */

function tick() {

    requestAnimFrame(tick);

    animate();

    draw();

}













function texture_creation(gl)
{
  // Create a texture.
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);



//BLOCKREMOVED

  //start insertion
/*
   var loadCubemapFace= function(gl, target, texture, url) {
      var image = new Image();
      image.onload = function(){
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
        gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      }
      image.src = url;
  };
    
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        loadCubemapFace(gl, gl.TEXTURE_CUBE_MAP_POSITIVE_X, texture, 'London/pos_x.png');
	      loadCubemapFace(gl, gl.TEXTURE_CUBE_MAP_NEGATIVE_X,texture, 'London/neg_x.png');
	      loadCubemapFace(gl, gl.TEXTURE_CUBE_MAP_POSITIVE_Y,texture, 'London/pos_y.png');
	      loadCubemapFace(gl, gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, texture, 'London/neg_y.png');
	      loadCubemapFace(gl, gl.TEXTURE_CUBE_MAP_POSITIVE_Z, texture, 'London/pos_z.png');
	      loadCubemapFace(gl, gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, texture, 'London/neg_z.png');

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    //end insertion

*/
//BLOCKREMOVED

  const faceInfos = [
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
      url: 'London/pos-x.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
      url: 'London/neg-x.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
      url: 'London/pos-y.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
      url: 'London/neg-y.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
      url: 'London/pos-z.png',
    },
    {
      target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
      url: 'London/neg-z.png',
    },
  ];


  faceInfos.forEach((faceInfo) => {
    const {target, url} = faceInfo;

    // Upload the canvas to the cubemap face.
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 512;
    const height = 512;
    const format = gl.RGBA;
    const type = gl.UNSIGNED_BYTE;

    // setup each face so it's immediately renderable

    gl.texImage2D(target, level, internalFormat, width, height, 0, format, type, null);

    // Asynchronously load an image
    const image = new Image();
    image.src = url;
    image.addEventListener('load', function() {
      // Now that the image has loaded make copy it to the texture.
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

      gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      //gl.texImage2D(target, level, internalFormat, format, type, image);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    });
  });

//BLOCKREMOVED

  //START insertion  
/*
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(textureLocation, 0);
*/
  //END insertion

  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  return texture
}








