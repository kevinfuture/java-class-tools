/*!
 * https://github.com/leonardosnt/java-class-tools
 *
 * Copyright (C) 2017 leonardosnt
 * Licensed under the MIT License. See LICENSE file in the project root for full license information.
 */

import ByteBuffer from 'bytebuffer';
import ConstantType from './constant-type';

/**
 * All objects (structure) follow Jvm8 specification.
 *
 * @see https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html
 */
class JavaClassFileReader {

  /**
   * Read and parse class file contents.
   *
   * @param {(Uint8Array|Buffer|ArrayBuffer)} source - Class file contents.
   * @return {ClassFile}
   * @see {@link https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.1}
   */
  read(source) {
    if (source == undefined) {
      throw TypeError('source cannot be null or undefined');
    }
    if (typeof source === 'string') {
      return this.readFromFile(source);
    }

    this.buf = ByteBuffer.wrap(source);
    this.classFile = new (function ClassFile(){});

    // Read magic
    if (this.buf.readUInt8() !== 0xCA ||
        this.buf.readUInt8() !== 0xFE ||
        this.buf.readUInt8() !== 0xBA ||
        this.buf.readUInt8() !== 0xBE) {
      throw Error('Invalid MAGIC value');
    }

    this.classFile.minor_version = this.buf.readUint16();
    this.classFile.major_version = this.buf.readUint16();

    this.classFile.constant_pool_count = this.buf.readUint16();
    this.classFile.constant_pool = this._readConstantPool(this.classFile.constant_pool_count - 1);

    this.classFile.access_flags = this.buf.readUint16();
    this.classFile.this_class = this.buf.readUint16();
    this.classFile.super_class = this.buf.readUint16();

    this.classFile.interfaces_count = this.buf.readUint16();
    this.classFile.interfaces = this._readInterfaces(this.classFile.interfaces_count);

    this.classFile.fields_count = this.buf.readUint16();
    this.classFile.fields = this._readCommonFieldMethodArray(this.classFile.fields_count);

    this.classFile.methods_count = this.buf.readUint16();
    this.classFile.methods = this._readCommonFieldMethodArray(this.classFile.methods_count);

    this.classFile.attributes_count = this.buf.readUint16();
    this.classFile.attributes = this._readAttributeInfoArray(this.classFile.attributes_count);

    const classFile = this.classFile;

    // Dispose
    delete this.buf;
    delete this.classFile;

    return classFile;
  }

  readFromFile(path) {
    if (typeof process !== undefined) { // node
      const fs = require('fs');
      return this.read(fs.readFileSync(path));
    } else {
      throw Error('not supported in browser.');
    }
  }

  /**
   * The "method_info" and "field_info" structures are identical.
   *
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.6
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.5
   */
  _readCommonFieldMethodArray(count) {
    const values = [];
    while (count-- > 0) {
      const struct = {
        access_flags: this.buf.readUint16(),
        name_index: this.buf.readUint16(),
        descriptor_index: this.buf.readUint16(),
        attributes_count: this.buf.readUint16(),
        attributes: []
      };
      struct.attributes = this._readAttributeInfoArray(struct.attributes_count);
      values.push(struct);
    }
    return values;
  }

  _readAttributeInfoArray(attributes_count) {
    const attributes = [];
    while (attributes_count-- > 0) {
      attributes.push(this._readAttributeInfo());
    }
    return attributes;
  }

  /**
   * Reads the "verification_type_info" structure.
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7.4
   */
  _readVerificationTypeInfo() {
    const type_info = {
      tag: this.buf.readUint8()
    };
    if (type_info.tag === 7) {
      type_info.cpool_index = this.buf.readUint16();
    } else if (type_info.tag === 8) {
      type_info.offset = this.buf.readUint16();
    }
    return type_info;
  }

  /**
   * Reads the "type_annotation" structure
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7.20
   */
  _readTypeAnnotation() {
    const type_annotation = {
      target_type: this.buf.readUint8(),
      target_info: {}
    };

    // Reads the "target_info" union.
    // https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7.20-400
    switch (type_annotation.target_type) {
      // type_parameter_target
      case 0x00: case 0x01:
        type_annotation.target_info.type_parameter_index = this.buf.readUint8();
        break;

      // supertype_target
      case 0x10:
        type_annotation.target_info.supertype_index = this.buf.readUint16();
        break;

      // type_parameter_bound_target
      case 0x11: case 0x12:
        type_annotation.target_info.type_parameter_index = this.buf.readUint8();
        type_annotation.target_info.bound_index = this.buf.readUint8();
        break;

      // empty_target
      case 0x13: case 0x14: case 0x15:
        // empty
        break;

      // formal_parameter_target
      case 0x16:
        type_annotation.target_info.formal_parameter_index = this.buf.readUint8();
        break;

      // throws_target
      case 0x17:
        type_annotation.target_info.throws_type_index = this.buf.readUint16();
        break;

      // localvar_target
      case 0x40: case 0x41: {
        type_annotation.target_info.table_length = this.buf.readUint16();
        type_annotation.target_info.table = [];

        let table_length = type_annotation.target_info.table_length;
        while (table_length-- > 0) {
          const table_entry = {
            start_pc: this.buf.readUint16(),
            length: this.buf.readUint16(),
            index: this.buf.readUint16()
          };
          type_annotation.target_info.table.push(table_entry);
        }
        break;
      }

      // catch_target
      case 0x42:
        type_annotation.target_info.exception_table_index = this.buf.readUint16();
        break;

      // offset_target
      case 0x43: case 0x44: case 0x45: case 0x46:
        type_annotation.target_info.offset = this.buf.readUint16();
        break;

      // type_argument_target
      case 0x47: case 0x48: case 0x49: case 0x4A: case 0x4B:
        type_annotation.target_info.offset = this.buf.readUint16();
        type_annotation.target_info.type_argument_index = this.buf.readUint8();
        break;

      default:
        throw Error(`Unexpected target_type: ${type_annotation.target_type}`);
    }

    // Reads "type_path" structure
    type_annotation.type_path = {
      path_length: this.buf.readUint8(),
      path: []
    };

    let path_length = type_annotation.type_path.path_length;
    while (path_length-- > 0) {
      const path_entry = {
        type_path_kind: this.buf.readUint8(),
        type_argument_index: this.buf.readUint8()
      };
      type_annotation.type_path.path.push(path_entry);
    }

    type_annotation.type_index = this.buf.readUint16();
    type_annotation.num_element_value_pairs = this.buf.readUint16();
    type_annotation.element_value_pairs = [];

    let num_element_value_pairs = type_annotation.num_element_value_pairs;
    while (num_element_value_pairs-- > 0) {
      const element_value_entry = {
        element_name_index: this.buf.readUint16(),
        element_value: this._readElementValue()
      };
      type_annotation.element_value_pairs.push(element_value_entry);
    }
    return type_annotation;
  }

  /**
   * Reads the "attribute_info" structure
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7
   */
  _readAttributeInfo() {
    const attribute = {
      attribute_name_index: this.buf.readUint16(),
      attribute_length: this.buf.readUint32()
    };

    let attributeNameBytes = this.classFile.constant_pool[attribute.attribute_name_index].bytes;
    let attributeName = String.fromCharCode.apply(null, attributeNameBytes); // TODO: is this safe?

    switch (attributeName) {
      case 'RuntimeInvisibleAnnotations':
      case 'RuntimeVisibleAnnotations': {
        attribute.num_annotations = this.buf.readUint16();
        attribute.annotations = [];
        let num_annotations = attribute.num_annotations;
        while (num_annotations-- > 0) {
          attribute.annotations.push(this._readAttributeAnnotation())
        }
        break;
      }

      // There's no additional information
      case 'Deprecated':
      case 'Synthetic':
        break;

      case 'InnerClasses': {
        attribute.number_of_classes = this.buf.readUint16();
        attribute.classes = [];

        let number_of_classes = attribute.number_of_classes;
        while (number_of_classes-- > 0) {
          const inner_class = {
            inner_class_info_index: this.buf.readUint16(),
            outer_class_info_index: this.buf.readUint16(),
            inner_name_index: this.buf.readUint16(),
            inner_class_access_flags: this.buf.readUint16()
          };
          attribute.classes.push(inner_class);
        }
        break;
      }

      case 'LocalVariableTable': {
        attribute.local_variable_table_length = this.buf.readUint16();
        attribute.local_variable_table = [];

        let local_variable_table_length = attribute.local_variable_table_length;
        while (local_variable_table_length-- > 0) {
          const local_variable = {
            start_pc: this.buf.readUint16(),
            length: this.buf.readUint16(),
            name_index: this.buf.readUint16(),
            descriptor_index: this.buf.readUint16(),
            index: this.buf.readUint16()
          };
          attribute.local_variable_table.push(local_variable);
        }
        break;
      }

      case 'LocalVariableTypeTable': {
        attribute.local_variable_type_table_length = this.buf.readUint16();
        attribute.local_variable_type_table = [];

        let local_variable_type_table_length = attribute.local_variable_type_table_length;
        while (local_variable_type_table_length-- > 0) {
          const local_variable_type = {
            start_pc: this.buf.readUint16(),
            length: this.buf.readUint16(),
            name_index: this.buf.readUint16(),
            signature_index: this.buf.readUint16(),
            index: this.buf.readUint16(),
          };
          attribute.local_variable_type_table.push(local_variable_type);
        }
        break;
      }

      case 'RuntimeInvisibleParameterAnnotations':
      case 'RuntimeVisibleParameterAnnotations': {
        attribute.num_parameters = this.buf.readUint8();
        attribute.parameter_annotations = [];

        let num_parameters = attribute.num_parameters;
        while (num_parameters-- > 0) {
          const parameter_annotation = {
            num_annotations: this.buf.readUint16(),
            annotations: []
          };

          let num_annotations = parameter_annotation.num_annotations;
          while (num_annotations-- > 0) {
            parameter_annotation.annotations.push(this._readAttributeAnnotation());
          }
          attribute.parameter_annotations.push(parameter_annotation);
        }
        break;
      }

      case 'BootstrapMethods': {
        attribute.num_bootstrap_methods = this.buf.readUint16();
        attribute.bootstrap_methods = [];

        let num_bootstrap_methods = attribute.num_bootstrap_methods;
        while (num_bootstrap_methods-- > 0) {
          const bootstrap_method = {
            bootstrap_method_ref: this.buf.readUint16(),
            num_bootstrap_arguments: this.buf.readUint16(),
            bootstrap_arguments: []
          };

          let num_bootstrap_arguments = bootstrap_method.num_bootstrap_arguments;
          while (num_bootstrap_arguments-- > 0) {
            bootstrap_method.bootstrap_arguments.push(this.buf.readUint16());
          }
          attribute.bootstrap_methods.push(bootstrap_method);
        }
        break;
      }

      case 'RuntimeInvisibleTypeAnnotations':
      case 'RuntimeVisibleTypeAnnotations': {
        attribute.num_annotations = this.buf.readUint16();
        attribute.annotations = [];

        let num_annotations = attribute.num_annotations;
        while (num_annotations-- > 0) {
          attribute.annotations.push(this._readTypeAnnotation());
        }
        break;
      }

      case 'SourceDebugExtension': {
        attribute.debug_extension = [];

        let attribute_length = attribute.attribute_length;
        while (attribute_length-- > 0) {
          attribute.debug_extension.push(this.buf.readUint8());
        }
        break;
      }

      case 'SourceFile':
        attribute.sourcefile_index = this.buf.readUint16();
        break;

      case 'EnclosingMethod':
        attribute.class_index = this.buf.readUint16();
        attribute.method_index = this.buf.readUint16();
        break;

      case 'AnnotationDefault':
        attribute.default_value = this._readElementValue();
        break;

      case 'MethodParameters': {
        attribute.parameters_count = this.buf.readUInt8();
        attribute.parameters = [];

        let parameters_count = attribute.parameters_count;
        while (parameters_count-- > 0) {
          const parameter = {
            name_index: this.buf.readUint16(),
            access_flags: this.buf.readUint16()
          };
          attribute.parameters.push(parameter);
        }
        break;
      }

      case 'Exceptions': {
        attribute.number_of_exceptions = this.buf.readUint16();
        attribute.exception_index_table = [];

        let number_of_exceptions = attribute.number_of_exceptions;
        while (number_of_exceptions-- > 0) {
          attribute.exception_index_table.push(this.buf.readUint16());
        }
        break;
      }

      case 'ConstantValue':
        attribute.constantvalue_index = this.buf.readUint16();
        break;

      case 'Signature':
        attribute.signature_index = this.buf.readUint16();
        break;

      /**
       * http://download.oracle.com/otndocs/jcp/7247-j2me_cldc-1.1-fr-spec-oth-JSpec/
       *
       * Appendix1-verifier.pdf at "2.1 Stack map format"
       *
       * "According to the CLDC specification, the sizes of some fields are not 16bit
       * but 32bit if the code size is more than 64K or the number of the local variables
       * is more than 64K.  However, for the J2ME CLDC technology, they are always 16bit.
       * The implementation of the StackMap class assumes they are 16bit." - javaassist
       */
      case 'StackMap': {
        attribute.number_of_entries = this.buf.readUint16();
        attribute.entries = [];

        let number_of_entries = attribute.number_of_entries;
        while (number_of_entries-- > 0) {
          const stack_map_frame = {
            offset: this.buf.readUint16(),
            number_of_locals: this.buf.readUint16(),
            locals: [],
            stack: []
          };

          let number_of_locals = stack_map_frame.number_of_locals;
          while (number_of_locals-- > 0) {
            stack_map_frame.locals.push(this._readVerificationTypeInfo());
          }

          stack_map_frame.number_of_stack_items = this.buf.readUInt16();

          let number_of_stack_items = stack_map_frame.number_of_stack_items;
          while (number_of_stack_items-- > 0) {
            stack_map_frame.stack.push(this._readVerificationTypeInfo());
          }

          attribute.entries.push(stack_map_frame);
        }
        break;
      }

      case 'StackMapTable': {
        attribute.number_of_entries = this.buf.readUint16();
        attribute.entries = [];

        let number_of_entries = attribute.number_of_entries;
        while (number_of_entries-- > 0) {
          const stack_map_frame = {
            frame_type: this.buf.readUint8()
          };

          // Shorthand
          const frame_type = stack_map_frame.frame_type;

          /**
           * offset_delta's that is "constant" are omited.
           *
           * like in "SAME" that offset_delta is the value of the tag item, frame_type. Or in
           * "SAME_LOCALS_1_STACK_ITEM" that offset_delta is given by the formula frame_type - 64.
           *
           * "SAME (0-63)" frame_type is omited because it's empty.
           *
           * See https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7.4
           * for more information.
           */

          // SAME_LOCALS_1_STACK_ITEM
          if (frame_type >= 64 &&  frame_type <= 127) {
            stack_map_frame.stack = [this._readVerificationTypeInfo()];
          }
          // SAME_LOCALS_1_STACK_ITEM_EXTENDED
          else if (stack_map_frame.frame_type === 247) {
            stack_map_frame.offset_delta = this.buf.readUint16();
            stack_map_frame.stack = [this._readVerificationTypeInfo()];
          }
          // CHOP = 248-250, SAME_FRAME_EXTENDED = 251
          else if (frame_type >= 248 && frame_type <= 251) {
            stack_map_frame.offset_delta = this.buf.readUint16();
          }
          // APPEND
          else if (frame_type >= 252 && frame_type <= 254) {
            stack_map_frame.offset_delta = this.buf.readUint16();
            stack_map_frame.locals = [];

            let number_of_locals = frame_type - 251;
            while (number_of_locals-- > 0) {
              stack_map_frame.locals.push(this._readVerificationTypeInfo());
            }
          }
          // FULL_FRAME
          else if (frame_type === 255) {
            stack_map_frame.offset_delta = this.buf.readUint16();
            stack_map_frame.number_of_locals = this.buf.readUint16();
            stack_map_frame.locals = [];

            let number_of_locals = stack_map_frame.number_of_locals;
            while (number_of_locals-- > 0) {
              stack_map_frame.locals.push(this._readVerificationTypeInfo());
            }

            stack_map_frame.number_of_stack_items = this.buf.readUint16();
            stack_map_frame.stack = [];

            let number_of_stack_items = stack_map_frame.number_of_stack_items;
            while (number_of_stack_items-- > 0) {
              stack_map_frame.stack.push(this._readVerificationTypeInfo());
            }
          }
          attribute.entries.push(stack_map_frame);
        }
        break;
      }

      case 'Code': {
        attribute.max_stack = this.buf.readUint16();
        attribute.max_locals = this.buf.readUint16();
        attribute.code_length = this.buf.readUint32();
        attribute.code = [];

        // Reads "code" array
        let code_length = attribute.code_length;
        while (code_length-- > 0) {
          attribute.code.push(this.buf.readUint8());
        }

        attribute.exception_table_length = this.buf.readUint16();
        attribute.exception_table = [];

        // Reads exception_table
        let exception_table_length = attribute.exception_table_length;
        while (exception_table_length-- > 0) {
          const exception_entry = {
            start_pc: this.buf.readUint16(),
            end_pc: this.buf.readUint16(),
            handler_pc: this.buf.readUint16(),
            catch_type: this.buf.readUint16()
          };
          attribute.exception_table.push(exception_entry);
        }

        attribute.attributes_count = this.buf.readUint16();
        attribute.attributes = this._readAttributeInfoArray(attribute.attributes_count);
        break;
      }

      case 'LineNumberTable': {
        attribute.line_number_table_length = this.buf.readUint16();
        attribute.line_number_table = [];

        let line_number_table_length = attribute.line_number_table_length;
        while (line_number_table_length-- > 0) {
          const line_number = {
            start_pc: this.buf.readUint16(),
            line_number: this.buf.readUint16()
          };
          attribute.line_number_table.push(line_number);
        }
        break;
      }

      case 'ModuleMainClass':
        attribute.main_class_index = this.buf.readUint16();
        break;

      case 'Module': {
        attribute.module_name_index = this.buf.readUint16();
        attribute.module_flags = this.buf.readUint16();
        attribute.module_version_index = this.buf.readUint16();

        attribute.requires_count = this.buf.readUint16();
        attribute.requires = [];

        let requires_count = attribute.requires_count;
        while (requires_count-- > 0) {
          attribute.requires.push({
            requires_index: this.buf.readUint16(),
            requires_flags: this.buf.readUint16(),
            requires_version_index: this.buf.readUint16()
          });
        }

        attribute.exports_count = this.buf.readUint16();
        attribute.exports = [];

        let exports_count = attribute.exports_count;
        while (exports_count-- > 0) {
          const entry = {
            exports_index: this.buf.readUint16(),
            exports_flags: this.buf.readUint16(),
            exports_to_count: this.buf.readUint16(),
            exports_to_index: []
          };

          let exports_to_count = entry.exports_to_count;
          while (exports_to_count-- > 0) {
            entry.exports_to_index.push(this.buf.readUint16());
          }

          attribute.exports.push(entry);
        }

        attribute.opens_count = this.buf.readUint16();
        attribute.opens = [];

        let opens_count = attribute.opens_count;
        while (opens_count-- > 0) {
          const entry = {
            opens_index: this.buf.readUint16(),
            opens_flags: this.buf.readUint16(),
            opens_to_count: this.buf.readUint16(),
            opens_to_index: []
          };

          let opens_to_count = entry.opens_to_count;
          while (opens_to_count-- > 0) {
            entry.opens_to_index.push(this.buf.readUint16());
          }

          attribute.opens.push(entry);
        }

        attribute.uses_count = this.buf.readUint16();
        attribute.uses_index = [];

        let uses_count = attribute.uses_count;
        while (uses_count-- > 0) {
          attribute.uses_index.push(this.buf.readUint16());
        }

        attribute.provides_count = this.buf.readUint16();
        attribute.provides = [];

        let provides_count = attribute.provides_count;
        while (provides_count-- > 0) {
          const entry = {
            provides_index: this.buf.readUint16(),
            provides_with_count: this.buf.readUint16(),
            provides_with_index: []
          };

          let provides_with_count = entry.provides_with_count;
          while (provides_with_count-- > 0) {
            entry.provides_with_index.push(this.buf.readUint16());
          }

          attribute.provides.push(entry);
        }
        break;
      }

      case 'ModulePackages': {
        attribute.package_count = this.buf.readUint16();
        attribute.package_index = [];

        let package_count = attribute.package_count;
        while (package_count-- > 0) {
          attribute.package_index.push(this.buf.readUint16());
        }
        break;
      }

      /* Not specified in JVMS 9 */
      case 'ModuleTarget':
        attribute.target_platform_index = this.buf.readUint16();
        break;

      case 'ModuleHashes': {
        attribute.algorithm_index = this.buf.readUint16();
        attribute.hashes_table_length = this.buf.readUint16();
        attribute.hashes_table = [];

        let hashes_table_length = attribute.hashes_table_length;
        while (hashes_table_length-- > 0) {
          const entry = {
            module_name_index: this.buf.readUint16(),
            hash_length: this.buf.readUint16(),
            hash: []
          };

          let hash_length = entry.hash_length;
          while (hash_length-- > 0) {
            entry.hash.push(this.buf.readUInt8());
          }

          attribute.hashes_table.push(entry);
        }
        break;
      }
      /* -- */

      // Unknown attributes
      // See: https://docs.oracle.com/javase/specs/jvms/se9/html/jvms-4.html#jvms-4.7.1
      default: {
        attribute.info = [];
        let attribute_length = attribute.attribute_length;
        while (attribute_length-- > 0) {
          attribute.info.push(this.buf.readUInt8());
        }
      }
    }

    return attribute;
  }

  /**
   * Reads the "annotation" structure
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7.16
   */
  _readAttributeAnnotation() {
    const annotation = {
      type_index: this.buf.readUint16(),
      num_element_value_pairs: this.buf.readUint16(),
      element_value_pairs: []
    };
    let len = annotation.num_element_value_pairs;
    while (len-- > 0) {
      const element = {
        element_name_index: this.buf.readUint16(),
        element_value: this._readElementValue()
      };
      annotation.element_value_pairs.push(element);
    }
    return annotation;
  }

  /**
   * Reads the "element_value" structure
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7.16.1
   */
  _readElementValue() {
    const element_value = {
      tag: this.buf.readUint8(),
      value: {}
    };

    /**
     *  https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.7.16.1-130
     */
    switch (element_value.tag) {
      case 101: // e
        element_value.value.enum_const_value = {
          type_name_index: this.buf.readUint16(),
          const_name_index: this.buf.readUint16()
        };
        break;

      case 99: // c
        element_value.value.class_info_index = this.buf.readUint16();
        break;

      case 91: { // [
        const array_value = {
          num_values: this.buf.readUInt16(),
          values: []
        };
        let num_values = array_value.num_values;
        while (num_values-- > 0) {
          array_value.values.push(this._readElementValue());
        }
        element_value.value.array_value = array_value;
        break;
      }

      case 64: // @
        element_value.value.annotation = this._readAttributeAnnotation();
        break;

      case 66: // B
      case 67: // C
      case 68: // D
      case 70: // F
      case 73: // I
      case 74: // J
      case 83: // S
      case 90: // Z
      case 115:// s
        element_value.value.const_value_index = this.buf.readUint16();
        break;

      default:
        throw Error(`Unexpected tag: ${element_value.tag}`);
    }

    return element_value;
  }

  _readInterfaces(interface_count) {
    const entries = [];
    while (interface_count-- > 0) {
      entries.push(this.buf.readUint16());
    }
    return entries;
  }

  /**
   * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4
   */
  _readConstantPool(pool_size) {
    /**
     * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.1
     * The constant_pool table is indexed from 1 to constant_pool_count-1.
     */
    const pool = [undefined];
    while (pool_size-- > 0) {
      let entry = this._readConstantPoolEntry();
      pool.push(entry);

      /**
       * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.5
       *
       * All 8-byte constants take up two entries in the constant_pool table of the class file.
       * If a CONSTANT_Long_info or CONSTANT_Double_info structure is the item in the constant_pool table at index n,
       * then the next usable item in the pool is located at index n+2.
       * The constant_pool index n+ must be valid but is considered unusable.
       */
      if (entry.tag === ConstantType.LONG || entry.tag === ConstantType.DOUBLE) {
        pool.push(undefined);
        pool_size--;
      }
    }
    return pool;
  }

  /** @private */
  _readConstantPoolEntry() {
    const cp_info = {
      tag: this.buf.readUInt8()
    };

    switch (cp_info.tag) {
      case ConstantType.UTF8: {
        let strLen = this.buf.readUint16();
        cp_info.length = strLen;
        cp_info.bytes = [];
        while (strLen-- > 0) {
          cp_info.bytes.push(this.buf.readUInt8());
        }
        break;
      }

      case ConstantType.INTEGER:
      case ConstantType.FLOAT:
        cp_info.bytes = this.buf.readUint32();
        break;

      case ConstantType.LONG:
      case ConstantType.DOUBLE:
        cp_info.high_bytes = this.buf.readUint32();
        cp_info.low_bytes = this.buf.readUint32();
        break;

      case ConstantType.PACKAGE:
      case ConstantType.MODULE:
      case ConstantType.CLASS:
        cp_info.name_index = this.buf.readUInt16();
        break;

      case ConstantType.STRING:
        cp_info.string_index = this.buf.readUInt16();
        break;

      /**
       * Fields, methods, and interface methods are represented by similar structures
       * https://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.2
       */
      case ConstantType.FIELDREF:
      case ConstantType.METHODREF:
      case ConstantType.INTERFACE_METHODREF:
        cp_info.class_index = this.buf.readUint16(),
        cp_info.name_and_type_index = this.buf.readUint16()
        break;

      case ConstantType.NAME_AND_TYPE:
        cp_info.name_index = this.buf.readUint16();
        cp_info.descriptor_index = this.buf.readUint16();
        break;

      case ConstantType.METHOD_HANDLE:
        cp_info.reference_kind = this.buf.readUint8();
        cp_info.reference_index = this.buf.readUint16();
        break;

      case ConstantType.METHOD_TYPE:
        cp_info.descriptor_index = this.buf.readUInt16();
        break;

      case ConstantType.INVOKE_DYNAMIC:
        cp_info.bootstrap_method_attr_index = this.buf.readUint16();
        cp_info.name_and_type_index = this.buf.readUint16();
        break;

      default:
        throw Error(`Unexpected tag: ${cp_info.tag}`);
    }
    return cp_info;
  }
}

module.exports = JavaClassFileReader;